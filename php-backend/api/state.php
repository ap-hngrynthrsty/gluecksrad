<?php
require __DIR__ . '/../db.php';
if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonError(405, 'GET erforderlich');

$db = getDb();
$session = requireSession($db);
echo json_encode(publicState($db, $session));
