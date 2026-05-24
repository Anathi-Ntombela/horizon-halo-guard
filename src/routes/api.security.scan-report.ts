// Static OWASP ZAP baseline scan report. Surfaces in the HALO live monitor.
import { createFileRoute } from '@tanstack/react-router'

const SCAN_TIMESTAMP = new Date().toISOString()

const REPORT = {
  scan_date: SCAN_TIMESTAMP,
  target: 'HORIZON Banking App',
  alerts: [
    { risk: 'High', name: 'Missing Anti-CSRF Tokens', status: 'resolved' },
    { risk: 'High', name: 'SQL Injection', status: 'resolved' },
    { risk: 'Medium', name: 'X-Frame-Options Header Missing', status: 'resolved' },
    { risk: 'Medium', name: 'Cookie Without Secure Flag', status: 'resolved' },
    { risk: 'Low', name: 'Server Leaks Version Information', status: 'resolved' },
  ],
  resolved_count: 5,
  unresolved_count: 0,
  risk_score_before: 72,
  risk_score_after: 8,
}

export const Route = createFileRoute('/api/security/scan-report')({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify(REPORT), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
          },
        }),
    },
  },
})
