<?php
declare(strict_types=1);

// The release workflow embeds the exact tag in the single-file artifact.
define('HAUSSTAND_RELEASE_TAG', 'development');
define('HAUSSTAND_UPDATE_CONTRACT', 'portable-v1-reset-1');

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
// Refuse a code swap if a legacy installation has customized its inline block.
$inlineConfigDefault = $HAUSSTAND_CONFIG === [
    'data_dir' => __DIR__ . '/../hausstand-private-data',
    'backup_email' => '', 'mail_from' => '', 'admin_token' => '',
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
// Return only published, non-prerelease PHP artifacts from the trusted repository.
function updateReleaseList(array $releases): array {
    $result = [];
    foreach ($releases as $release) {
        if (!is_array($release) || !empty($release['draft']) || !empty($release['prerelease'])) continue;
        $tag = $release['tag_name'] ?? '';
        $date = $release['published_at'] ?? '';
        if (!is_string($tag) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/D', $tag)
            || !is_string($date) || strtotime($date) === false) continue;
        foreach ($release['assets'] ?? [] as $asset) {
            if (($asset['name'] ?? '') !== 'hausstand.php' || ($asset['state'] ?? '') !== 'uploaded'
                || !is_int($asset['id'] ?? null) || $asset['id'] < 1) continue;
            $digest = $asset['digest'] ?? '';
            $result[$tag] = [
                'tag' => $tag, 'publishedAt' => $date, 'notes' => (string) ($release['body'] ?? ''),
                'assetId' => $asset['id'], 'digest' => is_string($digest) && preg_match('/^sha256:[a-f0-9]{64}$/D', $digest) ? $digest : null,
            ];
            break;
        }
    }
    usort($result, static fn($a,$b) => strtotime($b['publishedAt']) <=> strtotime($a['publishedAt']));
    return array_slice($result, 0, 5);
}
function updateSelectRelease(array $releases, string $tag): ?array {
    foreach ($releases as $release) if ($release['tag'] === $tag) return $release;
    return null;
}
function updateArtifactProblem(string $code, array $release): ?string {
    if (strlen($code) < 10000 || !str_starts_with($code, '<?php') || !str_contains($code, 'Hausstandsliste'))
        return 'invalidArtifact';
    if (!$release['digest'] || !hash_equals($release['digest'], 'sha256:' . hash('sha256', $code))) return 'integrity';
    // The artifact must declare its actual release identity and the exact supported
    // project/storage contract. Unmarked historical builds cannot be proven safe.
    if (!str_contains($code, "define('HAUSSTAND_RELEASE_TAG', '" . $release['tag'] . "');")
        || !str_contains($code, "define('HAUSSTAND_UPDATE_CONTRACT', '" . HAUSSTAND_UPDATE_CONTRACT . "');"))
        return 'incompatible';
    return null;
}
if ($api === 'update-list' || $api === 'update') {
    header('Content-Type: application/json; charset=utf-8');
    $failUpdate = static function(int $status, string $code): never {
        http_response_code($status);
        echo json_encode(['ok'=>false,'errorCode'=>$code]); exit;
    };
    $token = (string) (getenv('HAUSSTAND_ADMIN_TOKEN') ?: ($HAUSSTAND_CONFIG['admin_token'] ?? ''));
    $provided = (string) ($_SERVER['HTTP_X_HAUSSTAND_ADMIN'] ?? '');
    if ($token === '' || !hash_equals($token, $provided)) $failUpdate(403, 'admin');
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') $failUpdate(405, 'method');
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    $originHost = $origin !== '' ? (string) (parse_url($origin, PHP_URL_HOST) ?: '') : '';
    $originPort = $origin !== '' ? parse_url($origin, PHP_URL_PORT) : null;
    if (($origin !== '' && strcasecmp($originHost . ($originPort ? ':' . $originPort : ''), (string) ($_SERVER['HTTP_HOST'] ?? '')) !== 0)
        || ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'Hausstandsliste') $failUpdate(403, 'origin');
    if (!function_exists('curl_init')) $failUpdate(503, 'curl');
    $getGitHub = static function(string $url, bool $asset = false) use ($failUpdate): string {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_FOLLOWLOCATION=>$asset,
            CURLOPT_MAXREDIRS=>3, CURLOPT_TIMEOUT=>$asset ? 60 : 30,
            CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS=>CURLPROTO_HTTPS,
            CURLOPT_USERAGENT=>'Hausstandsliste-Updater',
            CURLOPT_HTTPHEADER=>['Accept: ' . ($asset ? 'application/octet-stream' : 'application/vnd.github+json')]]);
        $raw = curl_exec($ch); $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); curl_close($ch);
        if ($status !== 200 || !is_string($raw)) $failUpdate(502, 'github');
        return $raw;
    };
    // Query explicit published releases, not /latest. Paginate when releases
    // without PHP artifacts occupy the first page.
    $all = [];
    for ($page = 1; $page <= 10; $page++) {
        $batch = json_decode($getGitHub('https://api.github.com/repos/Uli-Z/hausstandsliste/releases?per_page=100&page=' . $page), true);
        if (!is_array($batch) || !array_is_list($batch)) $failUpdate(502, 'github');
        $all = array_merge($all, $batch);
        if (count($batch) < 100) break;
    }
    $releases = updateReleaseList($all);
    if ($api === 'update-list') {
        echo json_encode(['ok'=>true,'current'=>HAUSSTAND_RELEASE_TAG,
            'releases'=>array_map(static fn($r) => ['tag'=>$r['tag'],'publishedAt'=>$r['publishedAt'],
                'notes'=>$r['notes'],'verifiedDigest'=>$r['digest'] !== null], $releases)],
            JSON_INVALID_UTF8_SUBSTITUTE | JSON_UNESCAPED_UNICODE); exit;
    }
    $body = json_decode(file_get_contents('php://input') ?: '', true);
    $target = is_array($body) ? ($body['tag'] ?? null) : null;
    if (!is_string($target) || ($body['current'] ?? null) !== HAUSSTAND_RELEASE_TAG) $failUpdate(409, 'selection');
    $release = updateSelectRelease($releases, $target);
    if (!$release || $target === HAUSSTAND_RELEASE_TAG) $failUpdate(400, 'selection');
    if (!$release['digest']) $failUpdate(422, 'integrity');
    if (!$inlineConfigDefault) $failUpdate(409, 'inlineConfig');
    if (PHP_VERSION_ID < 80100 || !function_exists('exec')) $failUpdate(503, 'php');
    $code = $getGitHub('https://api.github.com/repos/Uli-Z/hausstandsliste/releases/assets/' . $release['assetId'], true);
    if ($problem = updateArtifactProblem($code, $release)) $failUpdate(422, $problem);
    $root = realpath((string) (getenv('HAUSSTAND_DATA_DIR') ?: ($HAUSSTAND_CONFIG['data_dir'] ?? '')));
    $webroot = realpath((string) ($_SERVER['DOCUMENT_ROOT'] ?? dirname(__FILE__)));
    if (!$root || !$webroot || !is_dir($root) || !is_writable($root)
        || $root === $webroot || str_starts_with($root, $webroot . DIRECTORY_SEPARATOR)
        || !is_writable(dirname(__FILE__))) $failUpdate(503, 'storage');
    // Share the project mutex so a version swap cannot overlap a project save.
    $lock = @fopen($root . '/.mutex', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) $failUpdate(503, 'lock');
    $original = @file_get_contents(__FILE__);
    if (!is_string($original) || !str_contains($original, "define('HAUSSTAND_RELEASE_TAG', '" . HAUSSTAND_RELEASE_TAG . "');"))
        $failUpdate(409, 'selection');
    $metaPath = $root . '/files/hausstand-hauptdatei/meta.json';
    if (is_file($metaPath)) {
        $meta = json_decode((string) @file_get_contents($metaPath), true);
        if (!is_array($meta)) $failUpdate(503, 'storage');
        if (!empty($meta['leaseHash']) && (int) ($meta['leaseExpires'] ?? 0) > time()) $failUpdate(409, 'editing');
    }
    // Back up the prior code outside the web root. Lint the candidate before
    // touching the live script; atomic rename is the only live-file change.
    $backup = @tempnam($root, '.program-backup-');
    $stage = dirname(__FILE__) . '/.hausstand-update-' . bin2hex(random_bytes(12)) . '.php';
    $backupTarget = $root . '/previous-program.php';
    $installed = false;
    try {
        if (!$backup || dirname($backup) !== $root || !@chmod($backup, 0600)
            || @file_put_contents($backup, $original, LOCK_EX) !== strlen($original)
            || !@rename($backup, $backupTarget)) throw new RuntimeException('backup');
        if (@file_put_contents($stage, $code, LOCK_EX) !== strlen($code)) throw new RuntimeException('storage');
        $phpCli = PHP_SAPI === 'cli' ? PHP_BINARY : 'php';
        $lint = []; $lintStatus = 1;
        exec(escapeshellarg($phpCli) . ' -l ' . escapeshellarg($stage) . ' 2>&1', $lint, $lintStatus);
        if ($lintStatus !== 0) throw new RuntimeException('php');
        if (!@chmod($stage, fileperms(__FILE__) & 0777) || !@rename($stage, __FILE__)) throw new RuntimeException('storage');
        $installed = true;
        clearstatcache(true, __FILE__);
        if (!hash_equals(hash('sha256', $code), (string) @hash_file('sha256', __FILE__))) throw new RuntimeException('integrity');
        if (function_exists('opcache_invalidate')) @opcache_invalidate(__FILE__, true);
    } catch (Throwable $e) {
        $reason = in_array($e->getMessage(), ['backup','storage','php','integrity'], true) ? $e->getMessage() : 'storage';
        if ($installed) {
            if (@file_put_contents($stage, $original, LOCK_EX) !== strlen($original)
                || !@chmod($stage, fileperms(__FILE__) & 0777) || !@rename($stage, __FILE__)) $reason = 'rollback';
            if (function_exists('opcache_invalidate')) @opcache_invalidate(__FILE__, true);
        }
        @unlink($stage); if ($backup) @unlink($backup);
        $failUpdate(500, $reason);
    }
    @unlink($stage); if ($backup) @unlink($backup);
    echo json_encode(['ok'=>true,'version'=>$target]); exit;
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
    // Optional transport writes must never terminate an already committed save.
    function tryMailJson(string $path, array $data): bool {
        $tmp = false;
        try {
            $str = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            $tmp = @tempnam(dirname($path), '.mail_');
            if ($tmp === false || dirname($tmp) !== dirname($path)) return false;
            if (@file_put_contents($tmp, $str, LOCK_EX) !== strlen($str)) return false;
            if (!@chmod($tmp, 0600) || !@rename($tmp, $path)) return false;
            $tmp = false;
            return true;
        } catch (Throwable $e) { return false; }
        finally { if ($tmp !== false) @unlink($tmp); }
    }
    function mailConfig(): array {
        global $HAUSSTAND_CONFIG;
        $email = (string) (getenv('HAUSSTAND_BACKUP_EMAIL') ?: ($HAUSSTAND_CONFIG['backup_email'] ?? ''));
        $from = (string) (getenv('HAUSSTAND_MAIL_FROM') ?: ($HAUSSTAND_CONFIG['mail_from'] ?? ''));
        if ($email === '' && $from === '') return ['disabled', '', ''];
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !filter_var($from, FILTER_VALIDATE_EMAIL))
            return ['invalid', '', ''];
        return ['ready', $email, $from];
    }
    function mailResult(string $status, ?string $errorCode = null, bool $retryable = false): array {
        return ['mailStatus' => $status, 'mailErrorCode' => $errorCode, 'mailRetryable' => $retryable];
    }
    // Mail is a separate encrypted transport, never the project history.
    function stageMailCopy(string $dir, array &$meta, int $rev, array $envelope): array {
        [$config] = mailConfig();
        if ($config === 'disabled') return mailResult('disabled');
        if ($config !== 'ready') return mailResult('failed', 'configuration', true);
        $mailDir = $dir . '/mail-queue';
        if ((!is_dir($mailDir) && !@mkdir($mailDir, 0700, true)) ||
            !tryMailJson($mailDir . '/' . $rev . '.json', $envelope))
            return mailResult('failed', 'preparation', true);
        $meta['mailQueue'] = $meta['mailQueue'] ?? [];
        $meta['mailQueue'][] = [
            'revision' => $rev, 'createdAt' => gmdate('c'), 'mailStatus' => 'pending',
            'attempts' => 0, 'lastAttempt' => 0
        ];
        return mailResult('pending', null, true);
    }
    function mailStatusFor(array $meta, int $rev, array $fallback): array {
        foreach ($meta['mailQueue'] ?? [] as $entry) {
            if ((int) $entry['revision'] !== $rev) continue;
            if ($entry['mailStatus'] === 'sent') return mailResult('accepted');
            if ($entry['mailStatus'] === 'sending') return mailResult('unknown', 'uncertain');
            $retryable = (int) ($entry['attempts'] ?? 0) < 5;
            return mailResult('failed', $entry['mailErrorCode'] ?? 'pending', $retryable);
        }
        return $fallback;
    }
    function mailPending(string $dir, array &$meta, ?int $onlyRevision = null): void {
        [$config, $email, $from] = mailConfig();
        if ($config !== 'ready' || empty($meta['mailQueue'])) return;
        // Iterate the actual array: a foreach over a null-coalescing expression
        // can update only a temporary copy instead of persisting the entry.
        foreach ($meta['mailQueue'] as &$entry) {
            if ($onlyRevision !== null && (int) $entry['revision'] !== $onlyRevision) continue;
            if (($entry['mailStatus'] ?? '') !== 'pending') continue;
            if (($entry['attempts'] ?? 0) >= 5) continue;
            if (($entry['lastAttempt'] ?? 0) + 300 > time()) continue;
            $rev = (int) $entry['revision'];
            $source = $dir . '/mail-queue/' . $rev . '.json';
            $content = @file_get_contents($source);
            if ($content === false) { $entry['mailErrorCode'] = 'preparation'; continue; }
            if (!function_exists('mail')) { $entry['mailErrorCode'] = 'unavailable'; continue; }
            // Persist the attempt before calling the transport. If the process
            // dies after submission, never automatically submit an uncertain copy again.
            $before = $entry;
            $entry['mailStatus'] = 'sending';
            $entry['attempts'] = ((int) ($entry['attempts'] ?? 0)) + 1;
            $entry['lastAttempt'] = time();
            if (!tryMailJson($dir . '/meta.json', $meta)) {
                $entry = $before; $entry['mailErrorCode'] = 'preparation'; continue;
            }
            try {
                $boundary = 'hausstand-' . bin2hex(random_bytes(12));
                $body = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n"
                    . "Verschluesselte Hausstand-Projektdatei, Revision $rev. Das Passwort wird nicht mitgesendet.\r\n"
                    . "--$boundary\r\nContent-Type: application/octet-stream; name=\"hausstand-$rev.enc.json\"\r\n"
                    . "Content-Disposition: attachment; filename=\"hausstand-$rev.enc.json\"\r\n"
                    . "Content-Transfer-Encoding: base64\r\n\r\n"
                    . chunk_split(base64_encode($content)) . "\r\n--$boundary--\r\n";
                $headers = "From: $from\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"$boundary\"";
                $ok = @mail($email, "Hausstand verschluesselte Sicherung Revision $rev", $body, $headers);
                $entry['mailStatus'] = $ok ? 'sent' : 'pending';
                $entry['mailErrorCode'] = $ok ? null : 'rejected';
            } catch (Throwable $e) {
                $entry['mailStatus'] = 'sending';
                $entry['mailErrorCode'] = 'uncertain';
            }
            if (tryMailJson($dir . '/meta.json', $meta) && $entry['mailStatus'] === 'sent') @unlink($source);
        }
        unset($entry);
        // Failure to persist mail-only state cannot turn a saved project into
        // a failed save response.
        tryMailJson($dir . '/meta.json', $meta);
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
    if (!in_array($api, ['create', 'login', 'logout', 'checkout', 'renew', 'checkin', 'save', 'retryMail'], true))
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
        $mail = stageMailCopy($dir, $meta, 1, $envelope);
        atomicJson($dir . '/meta.json', $meta);
        mailPending($dir, $meta);
        reply(['revision' => 1, 'saveStatus' => 'saved'] + mailStatusFor($meta, 1, $mail));
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
    if ($api === 'retryMail') {
        // A verified file capability may retry transport without obtaining a
        // write lease. Require the same revision and do not write project data.
        assertRevision($meta, $body);
        $rev = (int) $meta['revision'];
        [$config] = mailConfig();
        if ($config !== 'ready') reply(['revision' => $rev] + ($config === 'disabled'
            ? mailResult('disabled') : mailResult('failed', 'configuration', true)));
        $existing = mailStatusFor($meta, $rev, mailResult('missing'));
        if (in_array($existing['mailStatus'], ['accepted', 'unknown'], true) ||
            ($existing['mailStatus'] === 'failed' && !$existing['mailRetryable']))
            reply(['revision' => $rev] + $existing);
        if ($existing['mailStatus'] === 'missing') {
            $staged = stageMailCopy($dir, $meta, $rev, readJson(currentPath($dir, $meta)));
            if ($staged['mailStatus'] !== 'pending' || !tryMailJson($dir . '/meta.json', $meta))
                reply(['revision' => $rev] + ($staged['mailStatus'] === 'pending'
                    ? mailResult('failed', 'preparation', true) : $staged));
        } else {
            foreach ($meta['mailQueue'] as $entry) {
                if ((int) $entry['revision'] === $rev && ($entry['lastAttempt'] ?? 0) + 300 > time())
                    reply(['revision' => $rev] + mailResult('failed', 'cooldown', true));
            }
        }
        mailPending($dir, $meta, $rev);
        reply(['revision' => $rev] + mailStatusFor($meta, $rev, mailResult('failed', 'preparation', true)));
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
        // A destructive test reset must not send old queued backups later.
        // Change the queue pointer together with the current encrypted file;
        // never remove pending copies before the authoritative commit succeeds.
        $reset = ($body['resetProject'] ?? false) === true;
        if ($reset) $meta['mailQueue'] = [];
        $mail = stageMailCopy($dir, $meta, $next, $envelope);
        atomicJson($dir . '/meta.json', $meta);
        if ($reset) {
            foreach (glob($dir . '/mail-queue/*.json') ?: [] as $queued) {
                if (preg_match('/^([0-9]+)\.json$/D', basename($queued), $match) && (int) $match[1] < $next) @unlink($queued);
            }
        }
        mailPending($dir, $meta);
        if ($previousCurrent && $previousCurrent !== $nextCurrent) {
            @unlink($dir . '/' . $previousCurrent); // after successful meta commit only
        }
        reply(['revision' => $next, 'expiresAt' => $meta['leaseExpires'], 'saveStatus' => 'saved']
            + mailStatusFor($meta, $next, $mail));
    }
    fail(404, 'Unbekannte API-Aktion.', 'unknownAction');
}
?>
