import { useState, useEffect, useRef, useId } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Drawer } from '../../components/ui/Drawer';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { PillTabs } from '../../components/ui/Tabs';
import { MobileCard } from '../../components/ui/MobileCard';
import { ToastContainer, ToastMessage } from '../../components/ui/Toast';
import {
  PlusIcon,
  UsersIcon,
  SearchIcon,
  EditIcon,
  ArchiveIcon,
  RotateCcwIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  CloseIcon,
  MailIcon,
  PhoneIcon,
  MapPinIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '../../components/ui/icons';
import {
  fetchClients,
  createClient,
  updateClient,
  archiveClient,
  unarchiveClient,
  Client,
  ApiException,
} from '../../lib/api';

const clientFormSchema = z.object({
  name: z.string().trim().min(1, 'Client name is required').max(120, 'Name must not exceed 120 characters'),
  email: z
    .string()
    .trim()
    .email('Invalid email address')
    .optional()
    .or(z.literal('')),
  phone: z.string().trim().max(50, 'Phone must not exceed 50 characters').optional().or(z.literal('')),
  address: z.string().trim().max(300, 'Address must not exceed 300 characters').optional().or(z.literal('')),
});

type ClientFormData = z.infer<typeof clientFormSchema>;

export function ClientsPage() {
  const queryClient = useQueryClient();
  const toastId = useId();

  // Filters & State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'false' | 'true'>('false'); // 'false' = active, 'true' = archived
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientToArchive, setClientToArchive] = useState<Client | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [drawerApiError, setDrawerApiError] = useState<string | null>(null);

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
    setActiveTab(id as 'false' | 'true');
    setCurrentPage(1);
  };

  const addToast = (type: 'success' | 'error' | 'info', title: string, message?: string) => {
    const id = `${toastId}-${Date.now()}`;
    setToasts((prev) => [...prev, { id, type, title, message, duration: 4000 }]);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Query clients
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['clients', { page: currentPage, limit: PAGE_SIZE, search: debouncedSearchTerm, archived: activeTab }],
    queryFn: () =>
      fetchClients({
        page: currentPage,
        limit: PAGE_SIZE,
        search: debouncedSearchTerm || undefined,
        archived: activeTab,
      }),
  });

  const clients = data?.clients || [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages ?? 1;
  const totalClients = pagination?.total ?? 0;

  // Form setup
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormData>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      address: '',
    },
  });

  // Open Drawer for Create
  const handleOpenCreateDrawer = () => {
    setEditingClient(null);
    setDrawerApiError(null);
    reset({
      name: '',
      email: '',
      phone: '',
      address: '',
    });
    setIsDrawerOpen(true);
  };

  // Open Drawer for Edit
  const handleOpenEditDrawer = (client: Client) => {
    setEditingClient(client);
    setDrawerApiError(null);
    reset({
      name: client.name,
      email: client.email || '',
      phone: client.phone || '',
      address: client.address || '',
    });
    setIsDrawerOpen(true);
  };

  // Close Drawer
  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setEditingClient(null);
    setDrawerApiError(null);
  };

  // Save client mutation
  const saveMutation = useMutation({
    mutationFn: async (formData: ClientFormData) => {
      const payload = {
        name: formData.name,
        email: formData.email ? formData.email.trim() : null,
        phone: formData.phone ? formData.phone.trim() : null,
        address: formData.address ? formData.address.trim() : null,
      };

      if (editingClient) {
        return updateClient(editingClient.id, payload);
      } else {
        return createClient(payload);
      }
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      addToast(
        'success',
        editingClient ? 'Client updated' : 'Client created',
        `${res.client.name} has been successfully saved.`
      );
      handleCloseDrawer();
    },
    onError: (err: unknown) => {
      if (err instanceof ApiException) {
        setDrawerApiError(err.error?.message || 'Failed to save client.');
      } else if (err instanceof Error) {
        setDrawerApiError(err.message);
      } else {
        setDrawerApiError('An unexpected network error occurred.');
      }
    },
  });

  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      return archiveClient(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      addToast('success', 'Client archived', `${clientToArchive?.name} has been archived.`);
      setClientToArchive(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiException ? err.error.message : 'Failed to archive client.';
      addToast('error', 'Archive failed', msg);
      setClientToArchive(null);
    },
  });

  // Unarchive mutation
  const unarchiveMutation = useMutation({
    mutationFn: async (id: string) => {
      return unarchiveClient(id);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      addToast('success', 'Client restored', `${res.client.name} has been restored to active clients.`);
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiException ? err.error.message : 'Failed to restore client.';
      addToast('error', 'Restore failed', msg);
    },
  });

  const onSubmit = (formData: ClientFormData) => {
    setDrawerApiError(null);
    saveMutation.mutate(formData);
  };

  const tabs = [
    { id: 'false', label: 'Active' },
    { id: 'true', label: 'Archived' },
  ];

  return (
    <div className="space-y-6 text-left max-w-6xl mx-auto">
      {/* Toast Notifications Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-ink-900 tracking-tight">
            Clients
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            Manage your client accounts, billing addresses, and contact details
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={handleOpenCreateDrawer}
          leftIcon={<PlusIcon size={16} />}
        >
          Add client
        </Button>
      </div>

      {/* Controls: Search & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="relative w-full sm:w-80">
          <SearchIcon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-9 pr-9 py-2 rounded-lg bg-surface border border-line text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-colors"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
              aria-label="Clear search"
            >
              <CloseIcon size={14} />
            </button>
          )}
        </div>

        <PillTabs
          items={tabs}
          activeId={activeTab}
          onChange={handleTabChange}
        />
      </div>

      {/* Error state */}
      {isError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 border border-red-500/30 text-red-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm animate-in fade-in"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircleIcon size={20} className="shrink-0" />
            <span>Failed to load clients. Please check your network and retry.</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => refetch()} leftIcon={<RefreshCwIcon size={14} />}>
            Retry
          </Button>
        </div>
      )}

      {/* Loading Skeletons */}
      {isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading clients">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ) : clients.length === 0 ? (
        <EmptyState
          icon={<UsersIcon size={28} />}
          title={
            searchTerm
              ? `No clients found for "${searchTerm}"`
              : activeTab === 'true'
              ? 'No archived clients'
              : 'No clients yet'
          }
          description={
            searchTerm
              ? 'Try adjusting your search query or clear the filter.'
              : activeTab === 'true'
              ? 'Clients you archive in the future will be listed here for reference.'
              : 'Add your first client to start creating professional invoices with secure payment links.'
          }
          actionLabel={activeTab === 'false' && !searchTerm ? 'Add your first client' : undefined}
          onAction={activeTab === 'false' && !searchTerm ? handleOpenCreateDrawer : undefined}
        />
      ) : (
        <>
          {/* Desktop Table View (Hidden on mobile) */}
          <div className="hidden md:block rounded-xl bg-surface border border-line shadow-card overflow-hidden">
            <table className="w-full text-left text-sm divide-y divide-line">
              <thead className="bg-surface-2 text-ink-600 font-semibold text-xs uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Client Name</th>
                  <th className="py-3.5 px-4">Email</th>
                  <th className="py-3.5 px-4">Phone</th>
                  <th className="py-3.5 px-4">Address</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-surface-2/40 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-ink-900">
                      <div className="flex items-center gap-2">
                        <span>{client.name}</span>
                        {client.archivedAt && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-surface-2 text-ink-500 border border-line">
                            Archived
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-ink-600">
                      {client.email ? (
                        <a href={`mailto:${client.email}`} className="hover:text-blue-700 transition-colors">
                          {client.email}
                        </a>
                      ) : (
                        <span className="text-ink-400 italic">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-ink-600">
                      {client.phone ? (
                        <a href={`tel:${client.phone}`} className="hover:text-blue-700 transition-colors">
                          {client.phone}
                        </a>
                      ) : (
                        <span className="text-ink-400 italic">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-ink-600 max-w-xs truncate">
                      {client.address || <span className="text-ink-400 italic">—</span>}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEditDrawer(client)}
                          title="Edit client details"
                          aria-label={`Edit ${client.name}`}
                          leftIcon={<EditIcon size={14} />}
                        >
                          Edit
                        </Button>

                        {client.archivedAt ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => unarchiveMutation.mutate(client.id)}
                            disabled={unarchiveMutation.isPending}
                            title="Restore client to active"
                            aria-label={`Restore ${client.name}`}
                            leftIcon={<RotateCcwIcon size={14} />}
                          >
                            Restore
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setClientToArchive(client)}
                            title="Archive client"
                            aria-label={`Archive ${client.name}`}
                            className="text-red-700 hover:text-red-800 hover:bg-red-50"
                            leftIcon={<ArchiveIcon size={14} />}
                          >
                            Archive
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View (Hidden on desktop, verified at 390px) */}
          <div className="md:hidden space-y-3">
            {clients.map((client) => (
              <MobileCard
                key={client.id}
                title={client.name}
                statusBadge={
                  client.archivedAt ? (
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-surface-2 text-ink-500 border border-line">
                      Archived
                    </span>
                  ) : undefined
                }
              >
                <div className="space-y-3">
                  <div className="space-y-1.5 text-xs text-ink-600 pt-1">
                    {client.email && (
                      <div className="flex items-center gap-2">
                        <MailIcon size={14} className="text-ink-400 shrink-0" />
                        <a href={`mailto:${client.email}`} className="truncate hover:text-blue-700">
                          {client.email}
                        </a>
                      </div>
                    )}
                    {client.phone && (
                      <div className="flex items-center gap-2">
                        <PhoneIcon size={14} className="text-ink-400 shrink-0" />
                        <a href={`tel:${client.phone}`} className="truncate hover:text-blue-700">
                          {client.phone}
                        </a>
                      </div>
                    )}
                    {client.address && (
                      <div className="flex items-center gap-2">
                        <MapPinIcon size={14} className="text-ink-400 shrink-0" />
                        <span className="truncate">{client.address}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-line/60">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenEditDrawer(client)}
                      leftIcon={<EditIcon size={14} />}
                    >
                      Edit
                    </Button>

                    {client.archivedAt ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => unarchiveMutation.mutate(client.id)}
                        disabled={unarchiveMutation.isPending}
                        leftIcon={<RotateCcwIcon size={14} />}
                      >
                        Restore
                      </Button>
                    ) : (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setClientToArchive(client)}
                        leftIcon={<ArchiveIcon size={14} />}
                      >
                        Archive
                      </Button>
                    )}
                  </div>
                </div>
              </MobileCard>
            ))}
          </div>

          {/* Pagination Controls */}
          {clients.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-line text-xs text-ink-600">
              <div>
                Showing page <span className="font-semibold text-ink-900">{currentPage}</span> of{' '}
                <span className="font-semibold text-ink-900">{totalPages || 1}</span>
                {totalClients > 0 && (
                  <span className="text-ink-400"> ({totalClients} {totalClients === 1 ? 'client' : 'clients'} total)</span>
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

      {/* Client Create/Edit Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        title={editingClient ? `Edit ${editingClient.name}` : 'Add New Client'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 text-left" noValidate>
          {drawerApiError && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-red-50 border border-red-500/30 text-red-700 text-xs flex items-start gap-2.5 animate-in fade-in"
            >
              <AlertCircleIcon size={18} className="shrink-0 mt-0.5" />
              <div className="leading-relaxed">{drawerApiError}</div>
            </div>
          )}

          <Input
            label="Client Name"
            placeholder="e.g. Acme Logistics or Abebe Kebede"
            error={errors.name?.message}
            required
            {...register('name')}
          />

          <Input
            label="Email Address"
            type="email"
            placeholder="billing@client.com"
            error={errors.email?.message}
            helperText="Used to deliver payment links and invoices automatically"
            {...register('email')}
          />

          <Input
            label="Phone Number"
            type="tel"
            placeholder="+251 91 123 4567"
            error={errors.phone?.message}
            {...register('phone')}
          />

          <Textarea
            label="Billing Address"
            placeholder="Street address, City, Country"
            rows={3}
            error={errors.address?.message}
            helperText="Included on generated PDF invoices"
            {...register('address')}
          />

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-line mt-6">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={handleCloseDrawer}
              disabled={isSubmitting || saveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isSubmitting || saveMutation.isPending}
            >
              {editingClient ? 'Save Changes' : 'Create Client'}
            </Button>
          </div>
        </form>
      </Drawer>

      {/* Confirm Archive Dialog */}
      <ConfirmDialog
        isOpen={Boolean(clientToArchive)}
        onClose={() => setClientToArchive(null)}
        onConfirm={() => {
          if (clientToArchive) {
            archiveMutation.mutate(clientToArchive.id);
          }
        }}
        title={`Archive ${clientToArchive?.name || 'Client'}?`}
        description="Existing invoices for this client will remain in your records, but this client will no longer appear in new invoice client selectors. You can restore this client at any time from the Archived tab."
        confirmLabel="Archive Client"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={archiveMutation.isPending}
      />
    </div>
  );
}
