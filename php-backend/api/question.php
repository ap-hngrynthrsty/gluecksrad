<?php
require __DIR__ . '/../db.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError(405, 'POST erforderlich');

$db = getDb();
$body = readJsonBody();
$session = requireSession($db, $body);
$question = mb_substr(trim($body['question'] ?? ''), 0, 300);

$stmt = $db->prepare('UPDATE sessions SET question = ? WHERE id = ?');
$stmt->execute([$question, $session['id']]);

$session['question'] = $question;
echo json_encode(publicState($db, $session));
