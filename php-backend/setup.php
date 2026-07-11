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

// Migrations for columns added after the initial CREATE TABLE (which only
// runs on brand-new tables) - safe to re-run, errors from an already-existing
// column are simply ignored.
$migrations = [
    "ALTER TABLE sessions ADD COLUMN allow_participant_answers TINYINT(1) NOT NULL DEFAULT 0",
];
foreach ($migrations as $m) {
    try { $db->exec($m); } catch (PDOException $e) { /* column likely already exists */ }
}

$db->exec("INSERT IGNORE INTO stats (stat_key, value) VALUES ('sessions_created', 0), ('hearts_given', 0)");

echo json_encode(['ok' => true, 'message' => 'Tabellen angelegt/aktualisiert.']);
