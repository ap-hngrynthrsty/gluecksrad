<?php
require __DIR__ . '/../db.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError(405, 'POST erforderlich');

$db = getDb();
$body = readJsonBody();
$session = requireSession($db, $body);

$name = mb_substr(trim($body['name'] ?? ''), 0, 60);

$db->prepare('UPDATE sessions SET tip_count = tip_count + 1, tip_round = tip_round + 1, last_tipper_name = ? WHERE id = ?')
   ->execute([$name, $session['id']]);

$stmt = $db->prepare('SELECT * FROM sessions WHERE id = ?');
$stmt->execute([$session['id']]);
$session = $stmt->fetch();

echo json_encode(publicState($db, $session));
