import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

const STORAGE_KEY = 'halo:case-studies-open'

const ROWS = [
  {
    incident: 'Standard Bank (March 2026)',
    loss: '1.2TB data, 154M records exposed',
    missed: '3 weeks of undetected lateral movement',
    response: 'Honeypot detects probing in minutes. Incident timeline reconstructs the attack sequence.',
  },
  {
    incident: 'Land Bank (January 2026)',
    loss: 'R5.4M ransom demanded',
    missed: 'Entry through unpatched internet-facing server',
    response: 'Rate limiting blocks repeated probing. Anomaly detection flags unusual server behaviour.',
  },
  {
    incident: 'Postbank (January 2026)',
    loss: 'R42M stolen via employee workstation',
    missed: 'No friction on high-value transfers from compromised endpoint',
    response: 'Social engineering vector detection intercepts unusual transfers before execution.',
  },
]

export function CaseStudies() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(localStorage.getItem(STORAGE_KEY) === '1')
  }, [])

  const toggle = (next: boolean) => {
    setOpen(next)
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
  }

  return (
    <Card className="p-2">
      <Collapsible open={open} onOpenChange={toggle}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between font-semibold">
            Why was HALO built?
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="px-3 pb-4 pt-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[22%]">Incident</TableHead>
                  <TableHead className="w-[22%]">Loss</TableHead>
                  <TableHead className="w-[26%]">What Was Missed</TableHead>
                  <TableHead>How HALO Responds</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ROWS.map((r) => (
                  <TableRow key={r.incident}>
                    <TableCell className="font-medium align-top">{r.incident}</TableCell>
                    <TableCell className="align-top text-sm">{r.loss}</TableCell>
                    <TableCell className="align-top text-sm">{r.missed}</TableCell>
                    <TableCell className="align-top text-sm">{r.response}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-sm text-gray-500 mt-3">
            These three incidents share one root cause: the human layer was unmonitored.
            HALO watches both the system and the behaviour.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
