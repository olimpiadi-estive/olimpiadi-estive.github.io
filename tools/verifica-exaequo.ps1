# Verifica l'assegnazione delle posizioni con pari merito, come in setClassificaSport_.
function Posizioni([string]$ordine) {
    $gruppi = $ordine.Split(',') | ForEach-Object { ,@($_.Split('+') | Where-Object { $_ }) }
    $out = @(); $pos = 1
    foreach ($g in $gruppi) {
        foreach ($ref in $g) { $out += "$ref=$pos" }
        $pos += $g.Count
    }
    return ($out -join '  ')
}

$casi = @(
    @{ ordine = 'a,b,c,d';   atteso = 'a=1  b=2  c=3  d=4' },
    @{ ordine = 'a+b,c';     atteso = 'a=1  b=1  c=3' },
    @{ ordine = 'a+b+c,d';   atteso = 'a=1  b=1  c=1  d=4' },
    @{ ordine = 'a,b+c,d';   atteso = 'a=1  b=2  c=2  d=4' },
    @{ ordine = 'a,b,c+d';   atteso = 'a=1  b=2  c=3  d=3' },
    @{ ordine = 'a+b,c+d,e'; atteso = 'a=1  b=1  c=3  d=3  e=5' }
)

$ko = 0
foreach ($c in $casi) {
    $r = Posizioni $c.ordine
    $ok = $r -eq $c.atteso
    if (-not $ok) { $ko++ }
    "{0,-14} -> {1,-34} {2}" -f $c.ordine, $r, $(if ($ok) { 'OK' } else { "FALLITO (atteso: $($c.atteso))" })
}
''
'Medaglie: posizione 1 = oro, 2 = argento, 3 = bronzo.'
'Due ori ex aequo ("a+b,c"): a e b prendono oro, c prende bronzo, nessun argento.'
if ($ko) { "FALLITI: $ko"; exit 1 } else { 'Tutti i casi passano.' }
