<?php
declare(strict_types=1);

/**
 * Hausstand storage API. Distributed as one PHP file with inlined Svelte HTML.
 * Configuration: HAUSSTAND_DATA_DIR (required, outside webroot);
 * HAUSSTAND_WORKSPACE_KEY (required for creating new files);
 * HAUSSTAND_ALLOW_ORIGIN (optional, exact HTTPS frontend origin);
 * HAUSSTAND_BACKUP_EMAIL and HAUSSTAND_MAIL_FROM (optional, PHP mail transport).
 */
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
$api = (string) ($_GET['api'] ?? '');
if ($api !== '') {
    function fail(int $code, string $message): never {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
        exit;
    }
    function reply(array $data): never {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => true] + $data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
    function submitted(): array {
        $size = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        if ($size > 8388608) fail(413, 'Datei zu groß (maximal 8 MB).');
        $raw = file_get_contents('php://input');
        if ($raw === false || strlen($raw) > 8388608) fail(400, 'Anfrage ungültig.');
        $data = json_decode($raw, true);
        if (!is_array($data)) fail(400, 'Ungültiges JSON.');
        return $data;
    }
    function requireId($value): string {
        if (!is_string($value) || !preg_match('/^[a-z0-9-]{8,64}$/D', $value)) fail(400, 'Ungültige Datei-ID.');
        return $value;
    }
    function requireEnvelope($value): array {
        if (!is_array($value) || ($value['format'] ?? null) !== 'hausstand-aesgcm-v1'
           || ($value['version'] ?? null) !== 1 || ($value['cipher'] ?? null) !== 'AES-256-GCM'
           || !is_string($value['ciphertext'] ?? null)
           || strlen($value['ciphertext']) > 8000000
           || base64_decode($value['ciphertext'], true) === false) {
            fail(400, 'Ungültiges Verschlüsselungsformat.');
        }
        return $value;
    }
    function requireHash($value): string {
        if (!is_string($value) || !preg_match('/^[0-9a-f]{64}$/D', $value)) fail(400, 'Ungültiger Bearbeitungsschlüssel.');
        return $value;
    }
    function atomicJson(string $path, array $data): void {
        $str = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $tmp = tempnam(dirname($path), '.staged_');
        if ($tmp === false || file_put_contents($tmp, $str, LOCK_EX) === false) fail(500, 'Schreibfehler.');
        chmod($tmp, 0600);
        if (!rename($tmp, $path)) fail(500, 'Atomare Speicherung fehlgeschlagen.');
    }
    function readJson(string $path): array {
        if (!is_file($path)) fail(404, 'Datei/Version nicht gefunden.');
        $raw = file_get_contents($path);
        $data = $raw === false ? null : json_decode($raw, true);
        if (!is_array($data)) fail(500, 'Ungültiger Server-Datensatz.');
        return $data;
    }
    function checkedFile(string $root, string $id): array {
        $dir = $root . '/files/' . $id;
        return [$dir, readJson($dir . '/meta.json')];
    }
    function authorize(array $meta): void {
        $token = (string) ($_SERVER['HTTP_X_FILE_TOKEN'] ?? '');
        if (!preg_match('/^[0-9a-f]{64}$/D', $token)
            || !hash_equals((string) $meta['tokenHash'], hash('sha256', $token)))
            fail(403, 'Bearbeitung nicht autorisiert. Datei mit Passwort öffnen.');
    }
    function authorizeLease(array $meta): void {
        $token = (string) ($_SERVER['HTTP_X_LEASE_TOKEN'] ?? '');
        if (!preg_match('/^[0-9a-f]{64}$/D', $token)
            || empty($meta['leaseHash']) || !hash_equals($meta['leaseHash'], hash('sha256', $token))
            || (int) ($meta['leaseExpires'] ?? 0) <= time())
            fail(409, 'Checkout abgelaufen oder nicht mehr gültig. Ungespeicherte Änderungen lokal exportieren.');
    }
    function assertRevision(array $meta, array $body): void {
        if (!isset($body['expectedRevision']) || (int) $body['expectedRevision'] !== (int) $meta['revision'])
            fail(409, 'Eine neuere Revision existiert. Nicht überschrieben; bitte neu öffnen.');
    }
    function mailConfig(): array {
        $email = (string) (getenv('HAUSSTAND_BACKUP_EMAIL') ?: '');
        $from = (string) (getenv('HAUSSTAND_MAIL_FROM') ?: '');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !filter_var($from, FILTER_VALIDATE_EMAIL)) return ['', ''];
        return [$email, $from];
    }
    function mailPending(string $dir, array &$meta): void {
        [$email, $from] = mailConfig();
        if ($email === '') return;
        foreach ($meta['versions'] as &$entry) {
            if (($entry['mailStatus'] ?? '') === 'sent' || ($entry['mailStatus'] ?? '') === 'disabled') continue;
            if (($entry['attempts'] ?? 0) >= 5) continue;
            if ((int) ($entry['lastAttempt'] ?? 0) + 300 > time()) continue;
            $rev = $entry['revision'];
            $content = file_get_contents($dir . '/versions/' . $rev . '.json');
            if ($content === false) continue;
            $boundary = 'hausstand-' . bin2hex(random_bytes(12));
            $body = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n"
                . "Verschluesselte Hausstand-Projektdatei, Revision $rev. Das Passwort wird nicht mitgesendet.\r\n"
                . "--$boundary\r\nContent-Type: application/octet-stream; name=\"hausstand-$rev.enc.json\"\r\n"
                . "Content-Disposition: attachment; filename=\"hausstand-$rev.enc.json\"\r\n"
                . "Content-Transfer-Encoding: base64\r\n\r\n"
                . chunk_split(base64_encode($content)) . "\r\n--$boundary--\r\n";
            $headers = "From: $from\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"$boundary\"";
            $ok = @mail($email, "Hausstand verschluesselte Sicherung Revision $rev", $body, $headers);
            $entry['attempts'] = ((int) ($entry['attempts'] ?? 0)) + 1;
            $entry['lastAttempt'] = time();
            $entry['mailStatus'] = $ok ? 'sent' : 'pending';
        }
        unset($entry);
        atomicJson($dir . '/meta.json', $meta);
    }
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    $allowed = (string) (getenv('HAUSSTAND_ALLOW_ORIGIN') ?: '');
    $originHost = $origin !== '' ? (string) (parse_url($origin, PHP_URL_HOST) ?: '') : '';
    $originPort = $origin !== '' ? parse_url($origin, PHP_URL_PORT) : null;
    $originAuthority = $originHost . ($originPort ? ':' . $originPort : '');
    $sameOrigin = $originAuthority !== '' && strcasecmp($originAuthority, (string) ($_SERVER['HTTP_HOST'] ?? '')) === 0;
    $allowExternal = $allowed !== '' && $origin === $allowed;
    $originAccepted = $origin === '' || $sameOrigin || $allowExternal;
    if ($origin !== '' && $originAccepted) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, X-File-Token, X-Lease-Token, X-Workspace-Key');
    }
    if (!$originAccepted) fail(403, 'Origin nicht freigegeben.');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
    $rootEnv = (string) (getenv('HAUSSTAND_DATA_DIR') ?: '');
    $root = $rootEnv ? realpath($rootEnv) : false;
    if (!$root || !is_dir($root) || !is_writable($root)) fail(503, 'Serverdatenverzeichnis fehlt oder ist nicht beschreibbar.');
    $webroot = realpath((string) ($_SERVER['DOCUMENT_ROOT'] ?? dirname(__FILE__)));
    if ($webroot && ($root === $webroot || str_starts_with($root, $webroot . DIRECTORY_SEPARATOR)))
        fail(503, 'Serverdaten dürfen nicht im öffentlichen Webverzeichnis liegen.');
    if (!is_dir($root . '/files') && !mkdir($root . '/files', 0700, true)) fail(500, 'Ablage konnte nicht angelegt werden.');
    $lockHandle = fopen($root . '/.mutex', 'c');
    if (!$lockHandle || !flock($lockHandle, LOCK_EX)) fail(503, 'Server-Sperre nicht verfügbar.');
    $method = $_SERVER['REQUEST_METHOD'];
    $readActions = ['files', 'read', 'versions', 'version'];
    if (in_array($api, $readActions, true)) {
        if ($method !== 'GET') fail(405, 'GET erforderlich.');
        if ($api === 'files') {
            $files = [];
            foreach (glob($root . '/files/*/meta.json') ?: [] as $path) {
                $m = readJson($path);
                $files[] = ['id' => $m['id'], 'name' => $m['name'], 'revision' => $m['revision'],
                    'updatedAt' => $m['updatedAt'], 'lockedUntil' => ((int) ($m['leaseExpires'] ?? 0) > time() ? $m['leaseExpires'] : null)];
            }
            usort($files, fn($a, $b) => strcmp($a['name'], $b['name']));
            reply(['files' => $files]);
        }
        $id = requireId($_GET['id'] ?? '');
        [$dir, $meta] = checkedFile($root, $id);
        if ($api === 'versions') reply(['versions' => array_reverse($meta['versions'])]);
        $rev = $api === 'version' ? filter_var($_GET['rev'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) : $meta['revision'];
        if (!$rev || $rev > $meta['revision']) fail(404, 'Revision nicht vorhanden.');
        reply(['revision' => $rev, 'envelope' => readJson($dir . '/versions/' . $rev . '.json')]);
    }
    if ($method !== 'POST') fail(405, 'POST erforderlich.');
    $body = submitted();
    $id = requireId($body['id'] ?? '');
    if ($api === 'create') {
        $key = (string) (getenv('HAUSSTAND_WORKSPACE_KEY') ?: '');
        $provided = (string) ($_SERVER['HTTP_X_WORKSPACE_KEY'] ?? '');
        if (strlen($key) < 16 || !hash_equals($key, $provided)) fail(403, 'Workspace-Schlüssel fehlt oder ist ungültig.');
        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '' || strlen($name) > 240) fail(400, 'Dateiname ungültig.');
        $envelope = requireEnvelope($body['envelope'] ?? null);
        $tokenHash = requireHash($body['tokenHash'] ?? null);
        $dir = $root . '/files/' . $id;
        if (file_exists($dir) || !mkdir($dir . '/versions', 0700, true)) fail(409, 'Datei-ID bereits vergeben.');
        atomicJson($dir . '/versions/1.json', $envelope);
        $meta = [
            'id' => $id, 'name' => $name, 'revision' => 1, 'tokenHash' => $tokenHash,
            'leaseHash' => null, 'leaseExpires' => 0, 'updatedAt' => gmdate('c'),
            'versions' => [['revision' => 1, 'createdAt' => gmdate('c'),
                'mailStatus' => mailConfig()[0] !== '' ? 'pending' : 'disabled']]
        ];
        atomicJson($dir . '/meta.json', $meta);
        mailPending($dir, $meta);
        reply(['revision' => 1, 'mailStatus' => $meta['versions'][0]['mailStatus']]);
    }
    [$dir, $meta] = checkedFile($root, $id);
    authorize($meta);
    if ($api === 'checkout') {
        assertRevision($meta, $body);
        if (($meta['leaseExpires'] ?? 0) > time()) fail(423, 'Diese Datei ist bereits ausgecheckt.');
        $token = bin2hex(random_bytes(32));
        $meta['leaseHash'] = hash('sha256', $token);
        $meta['leaseExpires'] = time() + 7200;
        atomicJson($dir . '/meta.json', $meta);
        reply(['leaseToken' => $token, 'expiresAt' => $meta['leaseExpires']]);
    }
    if ($api === 'renew') {
        authorizeLease($meta);
        $meta['leaseExpires'] = time() + 7200;
        atomicJson($dir . '/meta.json', $meta);
        reply(['expiresAt' => $meta['leaseExpires']]);
    }
    if ($api === 'checkin') {
        authorizeLease($meta);
        $meta['leaseHash'] = null;
        $meta['leaseExpires'] = 0;
        atomicJson($dir . '/meta.json', $meta);
        reply(['checkedIn' => true]);
    }
    if ($api === 'save') {
        authorizeLease($meta);
        assertRevision($meta, $body);
        $envelope = requireEnvelope($body['envelope'] ?? null);
        $rotateHash = isset($body['newTokenHash']) ? requireHash($body['newTokenHash']) : null;
        $next = (int) $meta['revision'] + 1;
        atomicJson($dir . '/versions/' . $next . '.json', $envelope);
        $meta['revision'] = $next;
        if ($rotateHash !== null) $meta['tokenHash'] = $rotateHash;
        $meta['updatedAt'] = gmdate('c');
        $meta['leaseExpires'] = time() + 7200;
        $meta['versions'][] = ['revision' => $next, 'createdAt' => gmdate('c'),
            'mailStatus' => mailConfig()[0] !== '' ? 'pending' : 'disabled'];
        atomicJson($dir . '/meta.json', $meta);
        mailPending($dir, $meta);
        reply(['revision' => $next, 'expiresAt' => $meta['leaseExpires'],
            'mailStatus' => $meta['versions'][count($meta['versions']) - 1]['mailStatus']]);
    }
    fail(404, 'Unbekannte API-Aktion.');
}
?>
