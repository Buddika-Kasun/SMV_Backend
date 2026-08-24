# SMV Holdings Backend - End to end integration test (PowerShell)
# Requires: running server on :3000, seeded users, configured R2 bucket.

$ErrorActionPreference = 'Continue'
$base = 'http://localhost:3000/api'
$pass = 0; $fail = 0

function Check($name, $cond) {
  if ($cond) { $script:pass++; Write-Host "OK   - $name" -ForegroundColor Green }
  else { $script:fail++; Write-Host "FAIL - $name" -ForegroundColor Red }
}

try {
  $login = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' `
    -Body '{"username":"sysadmin","password":"Admin@123"}'
  Check 'login returns token' ([bool]$login.token -and $login.success)
  $headers = @{ Authorization = "Bearer $($login.token)" }

  # --- Consultancy passbook presigned upload round-trip ---
  $agreement = Invoke-RestMethod -Method Post -Uri "$base/consultancy/agreements" `
    -Headers $headers -ContentType 'application/json' -Body '{
      "customerName":"E2E Investor","customerPhone":"0771234567","nationalIdNumber":"921234567V",
      "bankName":"Peoples Bank","accountNumber":"123-456-789",
      "lastStatementBalance":480000,"placedAmount":500000,"startDate":"2026-02-01" }'
  $agId = $agreement.data.id
  Check 'consultancy created' ([bool]$agId)

  $presign = Invoke-RestMethod -Method Post -Uri "$base/consultancy/agreements/$agId/passbook" `
    -Headers $headers -ContentType 'application/json' `
    -Body '{"fileName":"passbook-e2e.txt","contentType":"text/plain"}'
  Check 'presign PUT url issued' ([bool]$presign.data.uploadUrl -and [bool]$presign.data.key)

  $up = Invoke-WebRequest -UseBasicParsing -Method Put -Uri $presign.data.uploadUrl -Body 'E2E passbook content' -ContentType 'text/plain'
  Check 'file uploaded to bucket' ($up.StatusCode -in 200,201,204)

  $confirm = Invoke-RestMethod -Method Put -Uri "$base/consultancy/agreements/$agId/passbook" `
    -Headers $headers -ContentType 'application/json' `
    -Body (@{ key = $presign.data.key; fileName = 'passbook-e2e.txt' } | ConvertTo-Json)
  Check 'passbook key persisted' ($confirm.data.passbookKey -eq $presign.data.key -and [bool]$confirm.data.passbookUrl)

  $fetched = Invoke-RestMethod -Method Get -Uri "$base/consultancy/agreements/$agId" -Headers $headers
  Check 'presigned GET url refreshed on read' ([bool]$fetched.data.passbookUrl)

  # Loan KYC document round-trip
  $loan = Invoke-RestMethod -Method Post -Uri "$base/loans" -Headers $headers -ContentType 'application/json' -Body '{
    "customerName":"E2E Borrower","customerPhone":"0772345678","customerEmail":"b@x.lk",
    "nationalIdNumber":"987654321V","loanType":"Standard Personal","requestedAmount":100000,
    "interestRatePerAnnum":18,"termMonths":12,"repaymentFrequency":"Monthly",
    "interestMethod":"Reducing Balance","purpose":"Business","monthlyIncome":50000,
    "occupation":"Trader","employerName":"Self","addressLine":"1 Main Rd","city":"Colombo",
    "postalCode":"01000","guarantorName":"G","guarantorPhone":"0771112223","guarantorRelation":"Brother",
    "bankName":"BOC","accountNumber":"2323232" }'
  $loanId = $loan.data.id
  Check 'loan created' ([bool]$loanId)

  $docPresign = Invoke-RestMethod -Method Post -Uri "$base/loans/$loanId/documents/presign" `
    -Headers $headers -ContentType 'application/json' `
    -Body '{"fileName":"nic.pdf","contentType":"application/pdf","documentType":"National ID / Passport"}'
  Check  'kyc doc presign issued' ([bool]$docPresign.data.uploadUrl)

  Invoke-WebRequest -UseBasicParsing -Method Put -Uri $docPresign.data.uploadUrl -Body 'fake-pdf' -ContentType 'application/pdf' | Out-Null
  $attach = Invoke-RestMethod -Method Put -Uri "$base/loans/$loanId/documents/attach" `
    -Headers $headers -ContentType 'application/json' `
    -Body (@{ documentId=$docPresign.data.documentId; key=$docPresign.data.key; fileName='nic.pdf'; documentType='National ID / Passport' } | ConvertTo-Json)
  Check 'kyc doc attached +key persisted' ($attach.data.kyc.documents[0].fileKey -eq $docPresign.data.key)

} catch {
  Write-Host "EXCEPTION: $_" -ForegroundColor Red
  $fail++
}

Write-Host ""
Write-Host "RESULT: $pass passed, $fail failed"