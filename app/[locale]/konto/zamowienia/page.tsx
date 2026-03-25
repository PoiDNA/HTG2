import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { FileText } from 'lucide-react';
import { createSupabaseServer } from '@/lib/supabase/server';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function OrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Account' });

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: orders } = user
    ? await supabase
        .from('orders')
        .select('id, status, total_amount, currency, invoice_url, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
    : { data: null };

  const orderList = orders || [];

  return (
    <div>
      <h2 className="text-xl font-serif font-semibold text-htg-fg mb-6">{t('orders')}</h2>

      {orderList.length === 0 ? (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-8 text-center">
          <FileText className="w-12 h-12 text-htg-fg-muted mx-auto mb-4" />
          <p className="text-htg-fg-muted">{t('no_orders')}</p>
        </div>
      ) : (
        <div className="bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
          {/* Mobile: card layout, Desktop: table */}
          <div className="hidden md:block">
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
                {orderList.map((order: any) => {
                  const date = new Date(order.created_at).toLocaleDateString(locale, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  });
                  const amount = (order.total_amount / 100).toFixed(2);
                  const isMigrated = order.total_amount === 0;

                  return (
                    <tr key={order.id} className="border-b border-htg-card-border last:border-0">
                      <td className="p-4 text-htg-fg">{date}</td>
                      <td className="p-4 text-htg-fg">
                        {isMigrated ? '—' : `${amount} ${order.currency?.toUpperCase() || 'PLN'}`}
                      </td>
                      <td className="p-4">
                        <OrderStatus status={order.status} />
                      </td>
                      <td className="p-4 text-right">
                        {order.invoice_url && (
                          <a
                            href={order.invoice_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-htg-sage hover:underline"
                          >
                            {t('download_invoice')}
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-htg-card-border">
            {orderList.map((order: any) => {
              const date = new Date(order.created_at).toLocaleDateString(locale, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });
              const amount = (order.total_amount / 100).toFixed(2);
              const isMigrated = order.total_amount === 0;

              return (
                <div key={order.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-htg-fg font-medium">{date}</span>
                    <OrderStatus status={order.status} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-htg-fg">
                      {isMigrated ? 'Migracja z WIX' : `${amount} ${order.currency?.toUpperCase() || 'PLN'}`}
                    </span>
                    {order.invoice_url && (
                      <a
                        href={order.invoice_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-htg-sage text-sm hover:underline"
                      >
                        Faktura
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function OrderStatus({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: 'bg-htg-sage/10 text-htg-sage',
    pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
    failed: 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400',
    refunded: 'bg-gray-100 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400',
  };

  const labels: Record<string, string> = {
    paid: 'Opłacone',
    pending: 'Oczekuje',
    failed: 'Nieudane',
    refunded: 'Zwrócone',
  };

  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full ${styles[status] || styles.pending}`}>
      {labels[status] || status}
    </span>
  );
}
