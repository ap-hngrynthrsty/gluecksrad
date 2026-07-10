<?php
require __DIR__ . '/../db.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError(405, 'POST erforderlich');

$db = getDb();
do {
    $code = genJoinCode();
    $stmt = $db->prepare('SELECT id FROM sessions WHERE join_code = ?');
    $stmt->execute([$code]);
} while ($stmt->fetch());

$stmt = $db->prepare('INSERT INTO sessions (join_code, question, round) VALUES (?, ?, 0)');
$stmt->execute([$code, '']);

echo json_encode(['code' => $code]);
