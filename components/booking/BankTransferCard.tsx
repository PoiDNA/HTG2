'use client';

import { Banknote, Download, Printer } from 'lucide-react';

interface BankTransferCardProps {
  email: string;
  labels: {
    title: string;
    recipient: string;
    account: string;
    reference: string;
    download: string;
    print: string;
  };
}

const RECIPIENT = 'XX Operator';
const ACCOUNT = '47 1020 1068 0000 1702 0555 6305';

function todayDDMMYYYY() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

function generatePrintWindow(email: string, action: 'print' | 'pdf') {
  const reference = `${email} ${todayDDMMYYYY()}`.toUpperCase();
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Dane do przelewu</title>
<style>
  @page { size: A4; margin: 30mm 25mm; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 17pt;
    text-transform: uppercase;
    line-height: 2.2;
    color: #000;
    margin: 0;
    padding: 40px;
  }
  .label { font-weight: bold; }
  .value { margin-bottom: 16px; }
  h1 { font-size: 22pt; margin-bottom: 32px; border-bottom: 2px solid #000; padding-bottom: 12px; }
</style>
</head>
<body>
<h1>DANE DO PRZELEWU</h1>
<div class="label">ODBIORCA:</div>
<div class="value">${RECIPIENT}</div>
<div class="label">NUMER KONTA:</div>
<div class="value">${ACCOUNT}</div>
<div class="label">TYTUŁ PRZELEWU:</div>
<div class="value">${reference}</div>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.addEventListener('load', () => {
    w.print();
  });
  // Fallback if load already fired
  setTimeout(() => w.print(), 500);
}

export default function BankTransferCard({ email, labels }: BankTransferCardProps) {
  const reference = `${email} ${todayDDMMYYYY()}`.toUpperCase();

  return (
    <div className="bg-htg-surface border border-htg-card-border rounded-xl p-5 mt-6">
      <h3 className="font-serif font-semibold text-sm text-htg-fg mb-4 flex items-center gap-2">
        <Banknote className="w-4 h-4 text-htg-fg-muted" />
        {labels.title}
      </h3>

      <div className="space-y-3 text-sm">
        <div>
          <span className="text-htg-fg-muted">{labels.recipient}: </span>
          <span className="text-htg-fg font-medium">{RECIPIENT}</span>
        </div>
        <div>
          <span className="text-htg-fg-muted">{labels.account}: </span>
          <span className="text-htg-fg font-mono font-medium">{ACCOUNT}</span>
        </div>
        <div>
          <span className="text-htg-fg-muted">{labels.reference}: </span>
          <span className="text-htg-fg font-medium">{reference}</span>
        </div>
      </div>

      <div className="flex gap-3 mt-4">
        <button
          onClick={() => generatePrintWindow(email, 'pdf')}
          className="flex items-center gap-2 px-4 py-2 bg-htg-card border border-htg-card-border rounded-lg text-sm text-htg-fg hover:bg-htg-surface transition-colors"
        >
          <Download className="w-4 h-4" />
          {labels.download}
        </button>
        <button
          onClick={() => generatePrintWindow(email, 'print')}
          className="flex items-center gap-2 px-4 py-2 bg-htg-card border border-htg-card-border rounded-lg text-sm text-htg-fg hover:bg-htg-surface transition-colors"
        >
          <Printer className="w-4 h-4" />
          {labels.print}
        </button>
      </div>
    </div>
  );
}
