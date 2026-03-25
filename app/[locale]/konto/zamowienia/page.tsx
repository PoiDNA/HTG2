import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { FileText } from 'lucide-react';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function OrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Account' });

  // TODO: Fetch from Supabase htg.orders WHERE user_id = auth.uid()
  const orders: any[] = [];

  return (
    <div>
      <h2 className="text-xl font-serif font-semibold text-htg-fg mb-6">{t('orders')}</h2>

      {orders.length === 0 ? (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-8 text-center">
          <FileText className="w-12 h-12 text-htg-fg-muted mx-auto mb-4" />
          <p className="text-htg-fg-muted">Brak zamówień.</p>
        </div>
      ) : (
        <div className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-htg-card-border bg-htg-surface">
                <th className="text-left p-4 font-medium text-htg-fg">{t('order_date')}</th>
                <th className="text-left p-4 font-medium text-htg-fg">{t('order_total')}</th>
                <th className="text-left p-4 font-medium text-htg-fg">{t('order_status')}</th>
                <th className="text-right p-4 font-medium text-htg-fg">{t('download_invoice')}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order: any) => (
                <tr key={order.id} className="border-b border-htg-card-border last:border-0">
                  <td className="p-4 text-htg-fg">{order.date}</td>
                  <td className="p-4 text-htg-fg">{order.total} PLN</td>
                  <td className="p-4">
                    <span className="text-htg-sage font-medium">{order.status}</span>
                  </td>
                  <td className="p-4 text-right">
                    {order.invoiceUrl && (
                      <a
                        href={order.invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-htg-sage hover:underline"
                      >
                        {t('download_invoice')}
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
