<# 
Diagnostic TradeSmart EcoBank - Lance dans PowerShell en admin
#>

$url = "https://tradesmart.ecobank.com/"

Write-Host "=== TEST CONNECTIVITÉ DE BASE ===" -ForegroundColor Cyan
try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -MaximumRedirection 0 -ErrorAction Stop
    Write-Host "✓ HTTP $($resp.StatusCode) $($resp.StatusDescription)" -ForegroundColor Green
    Write-Host "  Taille HTML : $($resp.RawContentLength) octets" -ForegroundColor Gray
}
catch {
    Write-Host "✗ ERREUR : $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        Write-Host "  Code : $($_.Exception.Response.StatusCode.value__)"
    }
}

Write-Host "`n=== SUIVI REDIRECTIONS (max 10) ===" -ForegroundColor Cyan
try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -MaximumRedirection 10 -ErrorAction Stop
    Write-Host "✓ URL finale : $($resp.BaseResponse.ResponseUri)" -ForegroundColor Green
    Write-Host "  Statut final : $($resp.StatusCode)"
}
catch {
    Write-Host "✗ ERREUR redirection : $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== HEADERS DE RÉPONSE ===" -ForegroundColor Cyan
try {
    $req = [System.Net.HttpWebRequest]::Create($url)
    $req.Method = "HEAD"
    $req.Timeout = 10000
    $resp = $req.GetResponse()
    $resp.Headers | ForEach-Object { Write-Host "  $_ : $($resp.Headers[$_])" }
    $resp.Close()
}
catch {
    Write-Host "✗ Erreur HEAD : $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== TEST TLS / CERTIFICAT ===" -ForegroundColor Cyan
try {
    $req = [System.Net.HttpWebRequest]::Create($url)
    $req.Method = "GET"
    $req.Timeout = 10000
    $resp = $req.GetResponse()
    Write-Host "✓ TLS OK - Protocole : $($resp.Headers["X-Powered-By"] ?? "inconnu")" -ForegroundColor Green
    $resp.Close()
}
catch {
    Write-Host "✗ Erreur TLS : $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== CONTENU HTML (premiers 5000 caractères) ===" -ForegroundColor Cyan
try {
    $html = Invoke-WebRequest -Uri $url -UseBasicParsing -ErrorAction Stop
    $content = $html.Content
    if ($content.Length -gt 5000) { $content = $content.Substring(0, 5000) + "...[tronqué]" }
    Write-Host $content
    
    # Vérifications rapides
    if ($content -match "<script") { Write-Host "`n✓ Balises <script> détectées" -ForegroundColor Green } else { Write-Host "`n⚠ AUCUN <script> trouvé" -ForegroundColor Yellow }
    if ($content -match "tradesmart|ecobank|TradeSmart") { Write-Host "✓ Contenu métier détecté" -ForegroundColor Green } else { Write-Host "⚠ Contenu métier ABSENT" -ForegroundColor Yellow }
    if ($content -match "challenge|cloudflare|recaptcha|bot") { Write-Host "⚠ Possible challenge Cloudflare/bot détecté" -ForegroundColor Yellow }
    if ($content -match "blank|empty|white|404|500|maintenance") { Write-Host "⚠ Mots-clés d'erreur/page vide détectés" -ForegroundColor Yellow }
}
catch {
    Write-Host "✗ Impossible de récupérer le contenu" -ForegroundColor Red
}

Write-Host "`n=== TEST DNS / IP ===" -ForegroundColor Cyan
try {
    $hostEntry = [System.Net.Dns]::GetHostEntry("tradesmart.ecobank.com")
    Write-Host "✓ DNS résout : $($hostEntry.HostName)"
    $hostEntry.AddressList | ForEach-Object { Write-Host "  IP : $_" }
}
catch {
    Write-Host "✗ Erreur DNS : $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== TEST PORT 443 ===" -ForegroundColor Cyan
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect("tradesmart.ecobank.com", 443)
    Write-Host "✓ Port 443 ouvert" -ForegroundColor Green
    $tcp.Close()
}
catch {
    Write-Host "✗ Port 443 bloqué : $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== PROXY SYSTÈME ===" -ForegroundColor Cyan
$proxy = [System.Net.WebRequest]::DefaultWebProxy
Write-Host "Proxy configuré : $($proxy.GetProxy($url))"
Write-Host "Bypass list : $($proxy.BypassArrayList -join ', ')"

Write-Host "`n=== FIN - Appuie sur Entrée pour fermer ===" -ForegroundColor Cyan
Read-Host