<?php
require __DIR__ . '/../db.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError(405, 'POST erforderlich');

$db = getDb();
$body = readJsonBody();
$session = requireSession($db, $body);

$allow = !empty($body['allowParticipantAnswers']) ? 1 : 0;
$db->prepare('UPDATE sessions SET allow_participant_answers = ? WHERE id = ?')->execute([$allow, $session['id']]);

$session['allow_participant_answers'] = $allow;
echo json_encode(publicState($db, $session));
