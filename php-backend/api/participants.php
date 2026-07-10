<?php
require __DIR__ . '/../db.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError(405, 'POST erforderlich');

$db = getDb();
$body = readJsonBody();
$session = requireSession($db, $body);
$action = $body['action'] ?? 'add';

if ($action === 'add') {
    $name = mb_substr(trim($body['name'] ?? ''), 0, 40);
    $answerId = (int)($body['answerId'] ?? 0);
    if ($name === '') jsonError(400, 'invalid participant');
    $stmt = $db->prepare('SELECT id FROM answers WHERE id = ? AND session_id = ?');
    $stmt->execute([$answerId, $session['id']]);
    if (!$stmt->fetch()) jsonError(400, 'invalid participant');
    $stmt = $db->prepare('INSERT INTO participants (session_id, device_id, name, answer_id) VALUES (?, NULL, ?, ?)');
    $stmt->execute([$session['id'], $name, $answerId]);
} elseif ($action === 'delete') {
    $id = (int)($body['id'] ?? 0);
    $stmt = $db->prepare('DELETE FROM participants WHERE id = ? AND session_id = ?');
    $stmt->execute([$id, $session['id']]);
} else {
    jsonError(400, 'unbekannte action');
}

echo json_encode(publicState($db, $session));
