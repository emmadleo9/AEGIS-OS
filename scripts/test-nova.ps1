$body = @{
  model = 'meta/llama-3.1-405b-instruct'
  messages = @(@{ role = 'user'; content = 'Say NOVA ONLINE in two words.' })
} | ConvertTo-Json -Depth 5
$r = Invoke-RestMethod -Method POST -ContentType 'application/json; charset=utf-8' -Body $body -Uri 'http://127.0.0.1:2785/api/nova/chat'
Write-Output "Llama 405B replied: $($r.reply)"
