# Verifica gli invarianti del tabellone con playoff, replicando bracket_ di Code.gs.
function SeedOrder([int]$size) {
    $order = @(1, 2)
    while ($order.Count -lt $size) {
        $somma = $order.Count * 2 + 1
        $next = @()
        foreach ($o in $order) { $next += $o; $next += ($somma - $o) }
        $order = $next
    }
    return $order
}

function Bracket([int]$n) {
    $refs = 1..$n | ForEach-Object { "P$_" }
    $posti = 1; while ($posti * 2 -le $n) { $posti *= 2 }
    $playoff = $n - $posti
    $turniMain = [math]::Round([math]::Log($posti) / [math]::Log(2))
    $offset = if ($playoff -gt 0) { 1 } else { 0 }

    $diretti = @(); if ($n - 2 * $playoff -gt 0) { $diretti = $refs[0..($n - 2 * $playoff - 1)] }
    $spareggio = @(); if ($playoff -gt 0) { $spareggio = $refs[($n - 2 * $playoff)..($n - 1)] }

    $ingressi = @($diretti) + (1..[math]::Max($playoff,0) | Where-Object { $playoff -gt 0 } | ForEach-Object { $null })
    $slots = @()
    foreach ($seed in (SeedOrder $posti)) {
        $slots += if ($seed -le $ingressi.Count) { $ingressi[$seed - 1] } else { '' }
    }

    $partite = @()
    $dest = @()
    for ($j = 0; $j -lt $posti / 2; $j++) {
        $sa = $slots[2 * $j]; $sb = $slots[2 * $j + 1]
        if ($null -eq $sa) { $dest += "$(1+$offset).$($j+1).A" }
        if ($null -eq $sb) { $dest += "$(1+$offset).$($j+1).B" }
        $partite += [pscustomobject]@{
            fase = "Main T1"; round = 1 + $offset; ordine = $j + 1
            A = if ($null -eq $sa) { '' } else { $sa }
            B = if ($null -eq $sb) { '' } else { $sb }
        }
    }
    $pl = @()
    for ($k = 0; $k -lt $playoff; $k++) {
        $pl += [pscustomobject]@{
            fase = 'Playoff'; round = 1; ordine = $k + 1
            A = $spareggio[2 * $k]; B = $spareggio[2 * $k + 1]
            prossimo = $dest[$k]
        }
    }
    $totMain = $posti - 1
    return [pscustomobject]@{
        n = $n; posti = $posti; playoff = $playoff
        turni = $turniMain + $offset
        totPartite = $playoff + $totMain
        playoffPartite = $pl
        mainT1 = $partite
        vuotiT1 = ($partite | ForEach-Object { @($_.A, $_.B) } | Where-Object { $_ -eq '' }).Count
        destUniche = (($dest | Select-Object -Unique).Count -eq $dest.Count)
        giocanoPlayoff = ($pl | ForEach-Object { @($_.A, $_.B) })
        direttiCount = ($n - 2 * $playoff)
    }
}

"{0,-4} {1,-6} {2,-8} {3,-6} {4,-9} {5,-8} {6,-9} {7}" -f 'n', 'posti', 'playoff', 'turni', 'partite', 'attese', 'vuoti T1', 'ok'
foreach ($n in 2..17) {
    $b = Bracket $n
    $attese = $n - 1
    $ok = ($b.totPartite -eq $attese) -and ($b.vuotiT1 -eq $b.playoff) -and $b.destUniche `
        -and ($b.giocanoPlayoff.Count -eq 2 * $b.playoff) `
        -and (($b.direttiCount + 2 * $b.playoff) -eq $n)
    "{0,-4} {1,-6} {2,-8} {3,-6} {4,-9} {5,-8} {6,-9} {7}" -f $n, $b.posti, $b.playoff, $b.turni,
        $b.totPartite, $attese, $b.vuotiT1, $(if ($ok) { 'OK' } else { 'FALLITO' })
}

'';'--- dettaglio n = 10 ---'
$b = Bracket 10
"posti=$($b.posti) playoff=$($b.playoff) turni=$($b.turni) partite=$($b.totPartite)"
'Playoff:'
$b.playoffPartite | ForEach-Object { "  T1.$($_.ordine): $($_.A) vs $($_.B)  -> $($_.prossimo)" }
'Tabellone, primo turno:'
$b.mainT1 | ForEach-Object { "  T2.$($_.ordine): $(if($_.A){$_.A}else{'<vincente playoff>'}) vs $(if($_.B){$_.B}else{'<vincente playoff>'})" }
