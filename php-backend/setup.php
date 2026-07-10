<?php
// Einmaliges Setup-Skript: legt die Tabellen an (idempotent) und loescht sich danach selbst.
// Aufruf: https://deine-domain.de/php-backend/setup.php
require __DIR__ . '/db.php';

$db = getDb();
$sql = file_get_contents(__DIR__ . '/schema.sql');
$statements = array_filter(array_map('trim', explode(';', $sql)));
foreach ($statements as $stmt) {
    if ($stmt === '') continue;
    $db->exec($stmt);
}

echo json_encode(['ok' => true, 'message' => 'Tabellen angelegt bzw. bereits vorhanden.']);
