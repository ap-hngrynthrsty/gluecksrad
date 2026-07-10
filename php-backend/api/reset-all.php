<?php
require __DIR__ . '/../db.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError(405, 'POST erforderlich');

$db = getDb();
$body = readJsonBody();
$session = requireSession($db, $body);

$db->prepare('DELETE FROM participants WHERE session_id = ?')->execute([$session['id']]);
$db->prepare('DELETE FROM answers WHERE session_id = ?')->execute([$session['id']]);
$db->prepare('UPDATE sessions SET question = \'\', round = 0, spin_data = NULL WHERE id = ?')->execute([$session['id']]);

$session['question'] = '';
$session['round'] = 0;
$session['spin_data'] = null;
echo json_encode(publicState($db, $session));
