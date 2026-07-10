<?php
require __DIR__ . '/../db.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError(405, 'POST erforderlich');

$db = getDb();
$body = readJsonBody();
$session = requireSession($db, $body);

$db->prepare('DELETE FROM participants WHERE session_id = ?')->execute([$session['id']]);
$db->prepare('UPDATE sessions SET spin_data = NULL WHERE id = ?')->execute([$session['id']]);

$session['spin_data'] = null;
echo json_encode(publicState($db, $session));
