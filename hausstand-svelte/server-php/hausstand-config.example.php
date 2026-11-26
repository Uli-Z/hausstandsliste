<?php
// Copy to hausstand-config.php on the server. Keep this file private and outside
// the public web root where possible. The deployed PHP script loads this file.
return [
    'data_dir' => '/home/ACCOUNT/hausstand-private-data',
    'backup_email' => '',
    'mail_from' => '',
    // Generate a long random value; enter the same value in Settings > Update.
    'admin_token' => '',
];
