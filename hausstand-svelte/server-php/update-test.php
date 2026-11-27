<?php
// Pure Q52 regression tests: never perform external downloads or overwrite a program.
require __DIR__ . '/backend.php';
function check($condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}
function fixture(string $tag, string $date, array $overrides = []): array {
    return array_replace(['tag_name'=>$tag,'published_at'=>$date,'draft'=>false,'prerelease'=>false,
        'body'=>"<script>unsafe markup</script>",'assets'=>[['name'=>'hausstand.php','state'=>'uploaded','id'=>1,'digest'=>'sha256:' . str_repeat('a',64)]]],$overrides);
}
$releases = [];
for ($i=1; $i<=7; $i++) $releases[] = fixture('php-'.$i, '2026-11-0'.$i.'T00:00:00Z');
$releases[] = fixture('draft','2026-11-28T00:00:00Z',['draft'=>true]);
$releases[] = fixture('pre','2026-11-28T00:00:00Z',['prerelease'=>true]);
$releases[] = fixture('no-php','2026-11-28T00:00:00Z',['assets'=>[]]);
$result = updateReleaseList(array_reverse($releases));
check(array_column($result,'tag')===['php-7','php-6','php-5','php-4','php-3'],'five newest eligible releases');
check($result[0]['notes']==='<script>unsafe markup</script>','full raw release notes; UI must escape them');
check(updateSelectRelease($result,'php-4')['tag']==='php-4','explicit older target');
check(updateSelectRelease($result,'php-2')===null,'older unlisted target refused');
$release = $result[0];
$code = "<?php\n// Hausstandsliste\n" . "define('HAUSSTAND_RELEASE_TAG', 'php-7');\n"
    . "define('HAUSSTAND_UPDATE_CONTRACT', '" . HAUSSTAND_UPDATE_CONTRACT . "');\n" . str_repeat(' ',10000);
$release['digest']='sha256:'.hash('sha256',$code);
check(updateArtifactProblem($code,$release)===null,'valid pinned artifact');
check(updateArtifactProblem($code.'x',$release)==='integrity','wrong digest');
$old=str_replace(HAUSSTAND_UPDATE_CONTRACT,'unsupported',$code);
$release['digest']='sha256:'.hash('sha256',$old);
check(updateArtifactProblem($old,$release)==='incompatible','incompatible old release blocked');
echo "Q52 release selection and artifact validation passed\n";
