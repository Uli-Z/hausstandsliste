<?php
declare(strict_types=1);

/**
 * Hausstand: Diese PHP-Datei ist die vollständige Server-App inklusive Oberfläche.
 * Nur der Serverbetreiber bearbeitet den folgenden Konfigurationsblock.
 * Keine Konfiguration/kein Workspace-Schlüssel wird an den Browser ausgegeben.
 *
 * data_dir: privater Ordner außerhalb des öffentlich erreichbaren Webverzeichnisses.
 * backup_email / mail_from: optional, verschlüsselte vollständige Projektdateien per PHP mail().
 *
 * Alternativ sind die gleichnamigen HAUSSTAND_* Umgebungsvariablen nutzbar.
 */
$HAUSSTAND_CONFIG = [
    'data_dir' => __DIR__ . '/../hausstand-private-data',
    'backup_email' => '',
    'mail_from' => '',
    // Configure only on the server, never in a committed build artifact.
    'admin_token' => '',
];
// Optional private config kept beside the deployed script, excluded from releases.
$privateConfig = (string) (getenv('HAUSSTAND_CONFIG_FILE') ?: (__DIR__ . '/../hausstand-config.php'));
if (is_file($privateConfig)) {
    $privateValues = require $privateConfig;
    if (is_array($privateValues)) $HAUSSTAND_CONFIG = array_merge($HAUSSTAND_CONFIG, $privateValues);
}
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
$api = (string) ($_GET['api'] ?? '');
if ($api === 'update') {
    header('Content-Type: application/json; charset=utf-8');
    $token = (string) (getenv('HAUSSTAND_ADMIN_TOKEN') ?: ($HAUSSTAND_CONFIG['admin_token'] ?? ''));
    $provided = (string) ($_SERVER['HTTP_X_HAUSSTAND_ADMIN'] ?? '');
    if ($token === '' || !hash_equals($token, $provided)) { http_response_code(403); echo json_encode(['ok'=>false,'error'=>'Admin-Autorisierung fehlgeschlagen.']); exit; }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['ok'=>false,'error'=>'POST erforderlich.']); exit; }
    if (!function_exists('curl_init')) { http_response_code(503); echo json_encode(['ok'=>false,'error'=>'PHP-cURL ist nicht verfügbar.']); exit; }
    $releaseUrl = 'https://api.github.com/repos/Uli-Z/hausstandsliste/releases/latest';
    $ch = curl_init($releaseUrl);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_FOLLOWLOCATION=>false, CURLOPT_TIMEOUT=>30, CURLOPT_USERAGENT=>'Hausstandsliste-Updater']);
    $releaseRaw = curl_exec($ch); $releaseCode = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); curl_close($ch);
    $release = is_string($releaseRaw) ? json_decode($releaseRaw, true) : null;
    $assetId = 0;
    foreach (($release['assets'] ?? []) as $asset) if (($asset['name'] ?? '') === 'hausstand.php') $assetId = (int) ($asset['id'] ?? 0);
    if ($releaseCode !== 200 || $assetId < 1) { http_response_code(502); echo json_encode(['ok'=>false,'error'=>'Kein gültiges PHP-Artefakt im neuesten Release.']); exit; }
    $download = curl_init('https://api.github.com/repos/Uli-Z/hausstandsliste/releases/assets/' . $assetId);
    curl_setopt_array($download, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_FOLLOWLOCATION=>true, CURLOPT_MAXREDIRS=>3, CURLOPT_TIMEOUT=>60, CURLOPT_USERAGENT=>'Hausstandsliste-Updater', CURLOPT_HTTPHEADER=>['Accept: application/octet-stream']]);
    $php = curl_exec($download); $downloadCode = (int) curl_getinfo($download, CURLINFO_RESPONSE_CODE); curl_close($download);
    if ($downloadCode !== 200 || !is_string($php) || strlen($php) < 10000 || !str_starts_with($php, '<?php') || !str_contains($php, 'Hausstandsliste')) { http_response_code(502); echo json_encode(['ok'=>false,'error'=>'Release-Datei ist ungültig.']); exit; }
    // Validate the new PHP before replacing the live file. The private config is a
    // separate file outside the web root, so the atomic code swap cannot overwrite it.
    $checkFile = __FILE__ . '.validate-' . bin2hex(random_bytes(6));
    if (file_put_contents($checkFile, $php, LOCK_EX) === false) { http_response_code(500); echo json_encode(['ok'=>false,'error'=>'Updateprüfung fehlgeschlagen.']); exit; }
    $lint = []; $lintCode = 1; exec(escapeshellarg(PHP_BINARY) . ' -l ' . escapeshellarg($checkFile) . ' 2>&1', $lint, $lintCode); @unlink($checkFile);
    if ($lintCode !== 0) { http_response_code(502); echo json_encode(['ok'=>false,'error'=>'Release enthält ungültigen PHP-Code.']); exit; }
    $tmp = __FILE__ . '.update-' . bin2hex(random_bytes(6));
    if (file_put_contents($tmp, $php, LOCK_EX) === false || !rename($tmp, __FILE__)) { @unlink($tmp); http_response_code(500); echo json_encode(['ok'=>false,'error'=>'Update konnte nicht atomar installiert werden.']); exit; }
    echo json_encode(['ok'=>true,'version'=>(string)($release['tag_name'] ?? '')]); exit;
}
if ($api !== '') {
    function fail(int $code, string $message, string $errorCode): never {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => $message, 'errorCode' => $errorCode], JSON_UNESCAPED_UNICODE);
        exit;
    }
    function reply(array $data): never {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => true] + $data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
    function submitted(): array {
        $size = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        if ($size > 8388608) fail(413, 'Datei zu groß (maximal 8 MB).', 'tooLarge');
        $raw = file_get_contents('php://input');
        if ($raw === false || strlen($raw) > 8388608) fail(400, 'Anfrage ungültig.', 'invalidRequest');
        $data = json_decode($raw, true);
        if (!is_array($data)) fail(400, 'Ungültiges JSON.', 'invalidJson');
        return $data;
    }
    function requireId($value): string {
        if (!is_string($value) || !preg_match('/^[a-z0-9-]{8,64}$/D', $value)) fail(400, 'Ungültige Datei-ID.', 'invalidId');
        return $value;
    }
    function requireEnvelope($value): array {
        if (!is_array($value) || ($value['format'] ?? null) !== 'hausstand-aesgcm-v1'
           || ($value['version'] ?? null) !== 1 || ($value['cipher'] ?? null) !== 'AES-256-GCM'
           || !is_string($value['ciphertext'] ?? null)
           || strlen($value['ciphertext']) > 8000000
           || base64_decode($value['ciphertext'], true) === false) {
            fail(400, 'Ungültiges Verschlüsselungsformat.', 'invalidEnvelope');
        }
        return $value;
    }
    function requireHash($value): string {
        if (!is_string($value) || !preg_match('/^[0-9a-f]{64}$/D', $value)) fail(400, 'Ungültiger Bearbeitungsschlüssel.', 'invalidToken');
        return $value;
    }
    function atomicJson(string $path, array $data): void {
        $str = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $tmp = tempnam(dirname($path), '.staged_');
        if ($tmp === false || file_put_contents($tmp, $str, LOCK_EX) === false) fail(500, 'Schreibfehler.', 'writeFailed');
        chmod($tmp, 0600);
        if (!rename($tmp, $path)) fail(500, 'Atomare Speicherung fehlgeschlagen.', 'atomicSave');
    }
    function readJson(string $path): array {
        if (!is_file($path)) fail(404, 'Datei/Version nicht gefunden.', 'notFound');
        $raw = file_get_contents($path);
        $data = $raw === false ? null : json_decode($raw, true);
        if (!is_array($data)) fail(500, 'Ungültiger Server-Datensatz.', 'invalidRecord');
        return $data;
    }
    function checkedFile(string $root, string $id): array {
        $dir = $root . '/files/' . $id;
        return [$dir, readJson($dir . '/meta.json')];
    }
    function currentPath(string $dir, array $meta): string {
        // Technical revision pointer is controlled by PHP, not the client.
        $current = $meta['currentFile'] ?? null;
        if (!is_string($current) || !preg_match('/^current-[1-9][0-9]*\.json$/D', $current))
            fail(500, 'Ungültiger Server-Dateizeiger.', 'invalidPointer');
        return $dir . '/' . $current;
    }
    function authorize(array $meta): void {
        $token = (string) ($_SERVER['HTTP_X_FILE_TOKEN'] ?? '');
        if (!preg_match('/^[0-9a-f]{64}$/D', $token)
            || !hash_equals((string) $meta['tokenHash'], hash('sha256', $token)))
            fail(403, 'Bearbeitung nicht autorisiert. Datei mit Passwort öffnen.', 'notAuthorized');
    }
    function authorizeLease(array $meta): void {
        $token = (string) ($_SERVER['HTTP_X_LEASE_TOKEN'] ?? '');
        if (!preg_match('/^[0-9a-f]{64}$/D', $token)
            || empty($meta['leaseHash']) || !hash_equals($meta['leaseHash'], hash('sha256', $token))
            || (int) ($meta['leaseExpires'] ?? 0) <= time())
            fail(409, 'Checkout abgelaufen oder nicht mehr gültig. Ungespeicherte Änderungen lokal exportieren.', 'leaseExpired');
    }
    function assertRevision(array $meta, array $body): void {
        if (!isset($body['expectedRevision']) || (int) $body['expectedRevision'] !== (int) $meta['revision'])
            fail(409, 'Eine neuere Revision existiert. Nicht überschrieben; bitte neu öffnen.', 'revisionConflict');
    }
    function mailConfig(): array {
        global $HAUSSTAND_CONFIG;
        $email = (string) (getenv('HAUSSTAND_BACKUP_EMAIL') ?: ($HAUSSTAND_CONFIG['backup_email'] ?? ''));
        $from = (string) (getenv('HAUSSTAND_MAIL_FROM') ?: ($HAUSSTAND_CONFIG['mail_from'] ?? ''));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !filter_var($from, FILTER_VALIDATE_EMAIL)) return ['', ''];
        return [$email, $from];
    }
    // E-mail is a separate encrypted backup transport, never the project history.
    function stageMailCopy(string $dir, array &$meta, int $rev, array $envelope): string {
        [$email, $from] = mailConfig();
        if ($email === '') return 'disabled';
        $mailDir = $dir . '/mail-queue';
        if (!is_dir($mailDir) && !mkdir($mailDir, 0700, true)) fail(500, 'Mail-Sicherung kann nicht vorbereitet werden.', 'mailPreparation');
        atomicJson($mailDir . '/' . $rev . '.json', $envelope);
        $meta['mailQueue'] = $meta['mailQueue'] ?? [];
        $meta['mailQueue'][] = [
            'revision' => $rev, 'createdAt' => gmdate('c'), 'mailStatus' => 'pending',
            'attempts' => 0, 'lastAttempt' => 0
        ];
        return 'pending';
    }
    function mailPending(string $dir, array &$meta): void {
        [$email, $from] = mailConfig();
        if ($email === '') return;
        foreach ($meta['mailQueue'] ?? [] as &$entry) {
            if (($entry['mailStatus'] ?? '') === 'sent') continue;
            if (($entry['attempts'] ?? 0) >= 5) continue;
            if (($entry['lastAttempt'] ?? 0) + 300 > time()) continue;
            $rev = $entry['revision'];
            $source = $dir . '/mail-queue/' . $rev . '.json';
            $content = @file_get_contents($source);
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
            if ($ok) @unlink($source);
        }
        unset($entry);
        atomicJson($dir . '/meta.json', $meta);
    }
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    $originHost = $origin !== '' ? (string) (parse_url($origin, PHP_URL_HOST) ?: '') : '';
    $originPort = $origin !== '' ? parse_url($origin, PHP_URL_PORT) : null;
    $originAuthority = $originHost . ($originPort ? ':' . $originPort : '');
    $sameOrigin = $originAuthority !== '' && strcasecmp($originAuthority, (string) ($_SERVER['HTTP_HOST'] ?? '')) === 0;
    // Die integrierte PHP-Oberfläche kommuniziert ausschließlich mit der eigenen Origin.
    $originAccepted = $origin === '' || $sameOrigin;
    if ($origin !== '' && $originAccepted) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, X-File-Token, X-Lease-Token');
    }
    if (!$originAccepted) fail(403, 'Origin nicht freigegeben.', 'origin');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
    $rootEnv = (string) (getenv('HAUSSTAND_DATA_DIR') ?: ($HAUSSTAND_CONFIG['data_dir'] ?? ''));
    if ($rootEnv === '') fail(503, 'Privates Serverdatenverzeichnis nicht konfiguriert.', 'missingDirectory');
    if (!is_dir($rootEnv) && !@mkdir($rootEnv, 0700, true) && !is_dir($rootEnv))
        fail(503, 'Privates Serverdatenverzeichnis kann nicht angelegt werden.', 'createDirectory');
    $root = realpath($rootEnv);
    if (!$root || !is_dir($root) || !is_writable($root)) fail(503, 'Serverdatenverzeichnis fehlt oder ist nicht beschreibbar.', 'unwritableDirectory');
    $webroot = realpath((string) ($_SERVER['DOCUMENT_ROOT'] ?? dirname(__FILE__)));
    if ($webroot && ($root === $webroot || str_starts_with($root, $webroot . DIRECTORY_SEPARATOR)))
        fail(503, 'Serverdaten dürfen nicht im öffentlichen Webverzeichnis liegen.', 'publicDirectory');
    if (!is_dir($root . '/files') && !mkdir($root . '/files', 0700, true)) fail(500, 'Ablage konnte nicht angelegt werden.', 'storageDirectory');
    $lockHandle = fopen($root . '/.mutex', 'c');
    if (!$lockHandle || !flock($lockHandle, LOCK_EX)) fail(503, 'Server-Sperre nicht verfügbar.', 'lockUnavailable');
    $method = $_SERVER['REQUEST_METHOD'];
    // One installation has one project. Its identifier is fixed by the server,
    // never selected by a visitor.
    $singleId = 'hausstand-hauptdatei';
    $readActions = ['config', 'read', 'session'];
    if (in_array($api, $readActions, true)) {
        if ($method !== 'GET') fail(405, 'GET erforderlich.', 'getRequired');
        if ($api === 'config') reply(['initialized' => is_file($root . '/files/' . $singleId . '/meta.json')]);
        if ($api === 'session') {
            ini_set('session.gc_maxlifetime', '2592000');
            session_set_cookie_params(['lifetime' => 2592000, 'path' => rtrim(dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/')), '/') . '/', 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'httponly' => true, 'samesite' => 'Strict']);
            session_start();
            reply(['authenticated' => ($_SESSION['hausstand_authenticated'] ?? false) === true]);
        }
        $id = requireId($_GET['id'] ?? '');
        if ($id !== $singleId) fail(404, 'Datei nicht gefunden.', 'notFound');
        [$dir, $meta] = checkedFile($root, $id);
        reply(['revision' => $meta['revision'], 'envelope' => readJson(currentPath($dir, $meta))]);
    }
    if (!in_array($api, ['create', 'login', 'logout', 'checkout', 'renew', 'checkin', 'save'], true))
        fail(404, 'Unbekannte API-Aktion.', 'unknownAction');
    if ($method !== 'POST') fail(405, 'POST erforderlich.', 'postRequired');
    $body = submitted();
    $id = requireId($body['id'] ?? '');
    if ($id !== $singleId) fail(404, 'Datei nicht gefunden.', 'notFound');
    if ($api === 'logout') {
        ini_set('session.gc_maxlifetime', '2592000');
        session_set_cookie_params(['lifetime' => 2592000, 'path' => rtrim(dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/')), '/') . '/', 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'httponly' => true, 'samesite' => 'Strict']);
        session_start();
        $_SESSION = [];
        session_destroy();
        setcookie(session_name(), '', ['expires' => 1, 'path' => rtrim(dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/')), '/') . '/', 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'httponly' => true, 'samesite' => 'Strict']);
        reply(['loggedOut' => true]);
    }
    if ($api === 'create') {
        $admin = (string) (getenv('HAUSSTAND_ADMIN_TOKEN') ?: ($HAUSSTAND_CONFIG['admin_token'] ?? ''));
        $provided = (string) ($_SERVER['HTTP_X_HAUSSTAND_ADMIN'] ?? '');
        if ($admin === '' || !hash_equals($admin, $provided)) fail(403, 'Administrationsschlüssel ungültig.', 'notAuthorized');
        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '' || strlen($name) > 240) fail(400, 'Dateiname ungültig.', 'invalidName');
        $envelope = requireEnvelope($body['envelope'] ?? null);
        $tokenHash = requireHash($body['tokenHash'] ?? null);
        $dir = $root . '/files/' . $id;
        if (file_exists($dir) || !mkdir($dir, 0700, true)) fail(409, 'Datei-ID bereits vergeben.', 'duplicateId');
        // The encrypted project contains its own complete versionHistory.
        atomicJson($dir . '/current-1.json', $envelope);
        $meta = [
            'id' => $id, 'name' => $name, 'revision' => 1, 'currentFile' => 'current-1.json', 'tokenHash' => $tokenHash,
            'leaseHash' => null, 'leaseExpires' => 0, 'updatedAt' => gmdate('c'),
            'mailQueue' => []
        ];
        $mailStatus = stageMailCopy($dir, $meta, 1, $envelope);
        atomicJson($dir . '/meta.json', $meta);
        mailPending($dir, $meta);
        $status = $meta['mailQueue'][0]['mailStatus'] ?? $mailStatus;
        reply(['revision' => 1, 'mailStatus' => $status]);
    }
    [$dir, $meta] = checkedFile($root, $id);
    authorize($meta);
    if ($api === 'login') {
        ini_set('session.gc_maxlifetime', '2592000');
        session_set_cookie_params(['lifetime' => 2592000, 'path' => rtrim(dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/')), '/') . '/', 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'httponly' => true, 'samesite' => 'Strict']);
        session_start();
        session_regenerate_id(true);
        $_SESSION['hausstand_authenticated'] = true;
        reply(['authenticated' => true]);
    }
    if ($api === 'checkout') {
        assertRevision($meta, $body);
        if (($meta['leaseExpires'] ?? 0) > time()) fail(423, 'Diese Datei ist bereits ausgecheckt.', 'alreadyCheckedOut');
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
        // Two-phase pointer swap: a crash before meta.json is committed leaves
        // the prior encrypted file authoritative, without keeping a history.
        $previousCurrent = $meta['currentFile'];
        $nextCurrent = 'current-' . $next . '.json';
        atomicJson($dir . '/' . $nextCurrent, $envelope);
        $meta['currentFile'] = $nextCurrent;
        $meta['revision'] = $next;
        if ($rotateHash !== null) $meta['tokenHash'] = $rotateHash;
        $meta['updatedAt'] = gmdate('c');
        $meta['leaseExpires'] = time() + 7200;
        $mailStatus = stageMailCopy($dir, $meta, $next, $envelope);
        atomicJson($dir . '/meta.json', $meta);
        mailPending($dir, $meta);
        if ($previousCurrent && $previousCurrent !== $nextCurrent) {
            @unlink($dir . '/' . $previousCurrent); // after successful meta commit only
        }
        $queue = $meta['mailQueue'] ?? [];
        $status = $queue ? $queue[count($queue) - 1]['mailStatus'] : $mailStatus;
        reply(['revision' => $next, 'expiresAt' => $meta['leaseExpires'],
            'mailStatus' => $status]);
    }
    fail(404, 'Unbekannte API-Aktion.', 'unknownAction');
}
?>
