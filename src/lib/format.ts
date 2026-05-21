export function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

export function categoryColor(cat: string) {
  const map: Record<string, string> = {
    Groceries: 'bg-emerald-100 text-emerald-700',
    Transport: 'bg-blue-100 text-blue-700',
    Income: 'bg-green-100 text-green-700',
    Entertainment: 'bg-purple-100 text-purple-700',
    Shopping: 'bg-pink-100 text-pink-700',
    'Food & Drink': 'bg-orange-100 text-orange-700',
    Utilities: 'bg-yellow-100 text-yellow-700',
    Transfer: 'bg-cyan-100 text-cyan-700',
  }
  return map[cat] ?? 'bg-slate-100 text-slate-700'
}
