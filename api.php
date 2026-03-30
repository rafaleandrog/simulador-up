<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

// =====================================================
// CONFIGURAÇÕES — substitua com seus tokens reais
// =====================================================
$AIRTABLE_TOKEN = 'AIRTABLE_TOKEN';
$BASE_ID        = 'BASE_ID';
$TABLE_NAME     = 'Transação';

// =====================================================
// MODO DEBUG: adicione &debug=1 na URL para ver
// todos os campos retornados pelo Airtable.
// Use para confirmar os nomes exatos dos campos!
// Exemplo: api.php?id=recXXXXXX&debug=1
// =====================================================
$debug = isset($_GET['debug']) && $_GET['debug'] === '1';

// =====================================================
// MAPEAMENTO DE CAMPOS
// Lista de variações possíveis do nome do campo no Airtable.
// O sistema tenta cada variação e usa a primeira que encontrar.
// Se nada funcionar, use &debug=1 para ver os nomes reais.
// =====================================================
$FIELD_MAP = [
    'area'     => ['Área (m²)',          'Area (m2)',          'Área',      'area'],
    'preco'    => ['Preço Simulador',    'Preco Simulador',    'Preço/m²',  'Preço', 'preco'],
    'prazo'    => ['Prazo Simulador',    'Prazo',              'prazo'],
    'sinal'    => ['Sinal Simulador',    'Sinal',              'sinal'],
    'carencia' => ['Carência Simulador', 'Carencia Simulador', 'Carência',  'Carencia', 'carencia'],
    'jic'      => ['JIC Simulador',      'JIC',                'jic'],
    'desconto' => ['Desconto Simulador', 'Desconto',           'desconto'],
];

// =====================================================
// Pega o ID da simulação
// =====================================================
$simId = isset($_GET['id']) ? trim($_GET['id']) : '';

if (empty($simId)) {
    http_response_code(400);
    echo json_encode(['error' => 'ID não fornecido', 'code' => 'MISSING_ID']);
    exit;
}

// =====================================================
// Monta URL do Airtable
// rawurlencode preserva acentos corretamente (Transação → Transa%C3%A7%C3%A3o)
// =====================================================
$url = "https://api.airtable.com/v0/{$BASE_ID}/" . rawurlencode($TABLE_NAME) . "/{$simId}";

// =====================================================
// Requisição ao Airtable
// =====================================================
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL,            $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT,        10);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer {$AIRTABLE_TOKEN}",
    "Content-Type: application/json",
]);

$response  = curl_exec($ch);
$httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

// Erros de rede/curl
if ($response === false) {
    http_response_code(502);
    echo json_encode([
        'error'  => 'Falha na conexão com o Airtable',
        'detail' => $curlError,
        'code'   => 'CURL_ERROR',
    ]);
    exit;
}

// Airtable retornou status de erro
if ($httpCode !== 200) {
    $raw = json_decode($response, true);
    http_response_code($httpCode === 404 ? 404 : 502);
    echo json_encode([
        'error'    => 'Airtable retornou HTTP ' . $httpCode,
        'detail'   => isset($raw['error']) ? ($raw['error']['message'] ?? $raw['error']['type'] ?? $response) : $response,
        'recordId' => $simId,
        'url'      => $url,
        'code'     => 'AIRTABLE_HTTP_' . $httpCode,
    ]);
    exit;
}

// Parse da resposta
$data = json_decode($response, true);

if (!$data || !isset($data['fields'])) {
    http_response_code(502);
    echo json_encode([
        'error' => 'Resposta inesperada do Airtable (sem campo "fields")',
        'raw'   => substr($response, 0, 500),
        'code'  => 'INVALID_RESPONSE',
    ]);
    exit;
}

$fields = $data['fields'];

// =====================================================
// MODO DEBUG — retorna os campos brutos do Airtable
// Use para descobrir os nomes exatos dos campos
// =====================================================
if ($debug) {
    echo json_encode([
        '__debug'  => true,
        '__record' => $simId,
        '__keys'   => array_keys($fields),
        '__fields' => $fields,
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

// =====================================================
// Busca o valor de um campo tentando cada variação de nome
// Retorna null se não encontrado (campo fica editável no simulador)
// =====================================================
function getField(array $fields, array $candidates) {
    foreach ($candidates as $name) {
        if (array_key_exists($name, $fields)) {
            $val = $fields[$name];
            // Já é número
            if (is_int($val) || is_float($val)) return (float) $val;
            // String numérica (aceita vírgula como decimal)
            if (is_string($val)) {
                $normalized = str_replace(',', '.', trim($val));
                if (is_numeric($normalized)) return (float) $normalized;
            }
            // Boolean (JIC pode ser checkbox no Airtable)
            if (is_bool($val)) return $val ? 1 : 0;
            // Valor não numérico — retorna null (campo editável)
            return null;
        }
    }
    return null;
}

// =====================================================
// Monta resposta
// null = campo não encontrado → simulador deixa editável
// número = campo encontrado  → simulador preenche e trava
// =====================================================
$simulacao = [
    'area'     => getField($fields, $FIELD_MAP['area']),
    'preco'    => getField($fields, $FIELD_MAP['preco']),
    'prazo'    => getField($fields, $FIELD_MAP['prazo']),
    'sinal'    => getField($fields, $FIELD_MAP['sinal']),
    'carencia' => getField($fields, $FIELD_MAP['carencia']),
    'jic'      => getField($fields, $FIELD_MAP['jic']),
    'desconto' => getField($fields, $FIELD_MAP['desconto']),
];

echo json_encode($simulacao, JSON_UNESCAPED_UNICODE);
exit;