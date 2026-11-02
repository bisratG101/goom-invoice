import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { PillTabs } from '../../components/ui/Tabs';
import { MobileCard } from '../../components/ui/MobileCard';
import { StatusChip, InvoiceStatus } from '../../components/ui/StatusChip';
import { ToastContainer, ToastMessage } from '../../components/ui/Toast';
import {
  PlusIcon,
  SearchIcon,
  XIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  AlertCircleIcon,
  FileTextIcon,
  EditIcon,
  EyeIcon,
} from '../../components/ui/icons';
import { fetchInvoices, Invoice } from '../../lib/api';
import { formatMoney } from '../../lib/money';

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'sent', label: 'Sent' },
  { id: 'paid', label: 'Paid' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'void', label: 'Void' },
];

export function InvoicesListPage() {
  const navigate = useNavigate();

  // Filters & State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const PAGE_SIZE = 20;
  const isFirstSearchRender = useRef(true);

  // Genuine 300ms debounce for search query
  // Synchronously batches debouncedSearchTerm update and page reset to 1
  // to prevent intermediate queries with the old page number and new search term
  useEffect(() => {
    if (isFirstSearchRender.current) {
      isFirstSearchRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
      setCurrentPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleClearSearch = () => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setCurrentPage(1);
  };

  const handleTabChange = (id: string) => {
    setActiveTab(id);
    setCurrentPage(1);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Query invoices
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['invoices', { page: currentPage, limit: PAGE_SIZE, search: debouncedSearchTerm, status: activeTab }],
    queryFn: () =>
      fetchInvoices({
        page: currentPage,
        limit: PAGE_SIZE,
        search: debouncedSearchTerm || undefined,
        status: activeTab === 'all' ? undefined : activeTab,
      }),
  });

  const invoices = data?.invoices || [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages ?? 1;
  const totalInvoices = pagination?.total ?? 0;

  // Derive display status chip (including overdue)
  const getInvoiceStatus = (inv: Invoice): InvoiceStatus => {
    if (inv.status === 'sent' && inv.isOverdue) {
      return 'overdue';
    }
    return inv.status;
  };

  return (
    <div className="space-y-6 text-left max-w-6xl mx-auto">
      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-ink-900 tracking-tight">
            Invoices
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            Create, manage, and track payment status for all client invoices
          </p>
        </div>

        <Link to="/app/invoices/new">
          <Button variant="primary" size="md" leftIcon={<PlusIcon size={16} />}>
            New invoice
          </Button>
        </Link>
      </div>

      {/* Search Bar & Status Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2">
        <div className="relative w-full sm:w-80">
          <SearchIcon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Search by client or invoice #..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-9 py-2 rounded-lg bg-surface border border-line text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-colors"
          />
          {searchTerm && (
            <button
              onClick={handleClearSearch}
              title="Clear search"
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600 p-1"
            >
              <XIcon size={14} />
            </button>
          )}
        </div>

        {/* Status Filter Tabs */}
        <div className="overflow-x-auto pb-1 sm:pb-0">
          <PillTabs
            items={STATUS_TABS}
            activeId={activeTab}
            onChange={handleTabChange}
          />
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-500/20 text-red-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircleIcon size={18} className="text-red-600 shrink-0" />
            <span className="text-sm font-medium">Failed to load invoices. Please check your connection and try again.</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading invoices">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && invoices.length === 0 && (
        <EmptyState
          icon={<FileTextIcon size={40} className="text-ink-400" />}
          title={
            debouncedSearchTerm
              ? `No invoices matching "${debouncedSearchTerm}"`
              : activeTab !== 'all'
              ? `No ${activeTab} invoices found`
              : 'No invoices created yet'
          }
          description={
            debouncedSearchTerm
              ? 'Try searching with a different client name or invoice number.'
              : activeTab !== 'all'
              ? `There are currently no invoices with ${activeTab} status.`
              : 'Create your first invoice to bill clients, share links, and track automated payment receipts.'
          }
          actionLabel={!debouncedSearchTerm && activeTab === 'all' ? 'Create invoice' : undefined}
          onAction={!debouncedSearchTerm && activeTab === 'all' ? () => navigate('/app/invoices/new') : undefined}
        />
      )}

      {/* Invoices List Content */}
      {!isLoading && !isError && invoices.length > 0 && (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block rounded-xl bg-surface border border-line shadow-card overflow-hidden">
            <table className="w-full text-left text-sm divide-y divide-line">
              <thead className="bg-surface-2 text-ink-600 font-semibold text-xs tracking-wider uppercase">
                <tr>
                  <th scope="col" className="py-3 px-4">Invoice #</th>
                  <th scope="col" className="py-3 px-4">Client</th>
                  <th scope="col" className="py-3 px-4">Issue Date</th>
                  <th scope="col" className="py-3 px-4">Due Date</th>
                  <th scope="col" className="py-3 px-4">Total</th>
                  <th scope="col" className="py-3 px-4">Status</th>
                  <th scope="col" className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60 bg-surface">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-surface-2/50 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-ink-900">
                      <Link
                        to={`/app/invoices/${inv.id}`}
                        className="hover:text-blue-700 transition-colors hover:underline"
                      >
                        {inv.displayNumber || <span className="font-sans text-ink-400 font-normal italic">Draft</span>}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-ink-900">
                      {inv.clientName || <span className="text-ink-400 italic">No client</span>}
                    </td>
                    <td className="py-3.5 px-4 text-ink-600 font-mono text-xs">
                      {inv.issueDate}
                    </td>
                    <td className="py-3.5 px-4 text-ink-600 font-mono text-xs">
                      {inv.dueDate}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-ink-900 tabular-nums">
                      {formatMoney(inv.totalMinor, inv.currency)}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusChip status={getInvoiceStatus(inv)} size="sm" />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link to={`/app/invoices/${inv.id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="View invoice details"
                            aria-label={`View ${inv.displayNumber || 'draft invoice'}`}
                            leftIcon={<EyeIcon size={14} />}
                          >
                            View
                          </Button>
                        </Link>
                        {inv.status === 'draft' && (
                          <Link to={`/app/invoices/${inv.id}/edit`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Edit draft invoice"
                              aria-label={`Edit ${inv.displayNumber || 'draft invoice'}`}
                              leftIcon={<EditIcon size={14} />}
                            >
                              Edit
                            </Button>
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View (Hidden on desktop) */}
          <div className="md:hidden space-y-3">
            {invoices.map((inv) => (
              <MobileCard
                key={inv.id}
                title={inv.displayNumber || 'Draft Invoice'}
                statusBadge={<StatusChip status={getInvoiceStatus(inv)} size="sm" />}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-ink-900">
                      {inv.clientName || 'No client'}
                    </span>
                    <span className="font-bold text-ink-900 tabular-nums">
                      {formatMoney(inv.totalMinor, inv.currency)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-ink-500 font-mono">
                    <span>Issued: {inv.issueDate}</span>
                    <span>Due: {inv.dueDate}</span>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-line/60">
                    <Link to={`/app/invoices/${inv.id}`}>
                      <Button variant="secondary" size="sm" leftIcon={<EyeIcon size={14} />}>
                        View details
                      </Button>
                    </Link>
                    {inv.status === 'draft' && (
                      <Link to={`/app/invoices/${inv.id}/edit`}>
                        <Button variant="ghost" size="sm" leftIcon={<EditIcon size={14} />}>
                          Edit
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </MobileCard>
            ))}
          </div>

          {/* Pagination Controls */}
          {invoices.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-line text-xs text-ink-600">
              <div>
                Showing page <span className="font-semibold text-ink-900">{currentPage}</span> of{' '}
                <span className="font-semibold text-ink-900">{totalPages || 1}</span>
                {totalInvoices > 0 && (
                  <span className="text-ink-400"> ({totalInvoices} {totalInvoices === 1 ? 'invoice' : 'invoices'} total)</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1 || isLoading}
                  leftIcon={<ChevronLeftIcon size={14} />}
                  aria-label="Previous page"
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages || isLoading}
                  rightIcon={<ChevronRightIcon size={14} />}
                  aria-label="Next page"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
