<?php
// Allow cross-origin requests for testing
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

// Define our BODMAS questions
$questions = [
    [
        "expression" => "8 + 3 * 2",
        "correctStep" => "3 * 2",
        "options" => ["8 + 3", "3 * 2", "8 + 2", "3 + 2"]
    ],
    [
        "expression" => "15 - 10 / 2",
        "correctStep" => "10 / 2",
        "options" => ["15 - 10", "10 / 2", "15 / 2", "10 - 2"]
    ],
    [
        "expression" => "( 4 + 2 ) * 3",
        "correctStep" => "( 4 + 2 )",
        "options" => ["2 * 3", "( 4 + 2 )", "4 * 3", "4 + 3"]
    ],
    [
        "expression" => "20 / 4 + 5",
        "correctStep" => "20 / 4",
        "options" => ["4 + 5", "20 / 4", "20 + 5", "20 / 9"]
    ],
    [
        "expression" => "12 - 3 * 3 + 1",
        "correctStep" => "3 * 3",
        "options" => ["12 - 3", "3 * 3", "3 + 1", "12 + 1"]
    ],
    [
        "expression" => "6 + ( 8 / 2 )",
        "correctStep" => "( 8 / 2 )",
        "options" => ["6 + 8", "( 8 / 2 )", "6 + 2", "8 / 6"]
    ]
];

// Output as JSON
echo json_encode($questions);
?>