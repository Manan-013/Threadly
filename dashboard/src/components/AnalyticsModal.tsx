import React, { useEffect, useState } from 'react';
import {
  X,
  FileBarChart2,
  LayoutGrid,
  Inbox,
  Search,
  Plus,
  Download,
  Calendar,
  Clock,
  RefreshCw,
  Pencil,
  Copy,
  Trash2,
  SlidersHorizontal,
  Settings,
  HelpCircle,
  ChevronDown,
  Mail,
} from 'lucide-react';
import { ThreadlyAnalyticsIcon } from './ThreadlyBrandIcon';

interface AnalyticsModalProps {
  onClose: () => void;
  inboxes: any[];
  dashboards: any[];
  customReports: any[];
  currentUserName: string;
  onRefreshBootstrap: () => void;
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({
  onClose,
  inboxes,
  dashboards,
  customReports,
  currentUserName,
  onRefreshBootstrap,
}) => {
  const [topTab, setTopTab] = useState<'reports' | 'dashboards'>('reports');
  const [selectedInboxId, setSelectedInboxId] = useState<string>(
    inboxes[0]?.id ? String(inboxes[0].id) : ''
  );
  const [reportSection, setReportSection] = useState<
    'conversations' | 'users' | 'tags' | 'contacts' | 'new_export' | 'schedule_export' | 'custom_report'
  >('conversations');
  const [workloadTab, setWorkloadTab] = useState<'active' | 'new' | 'resolved'>('active');
  const [perfTab, setPerfTab] = useState<'frt' | 'fat' | 'rt' | 'rest'>('frt');
  const [hoursMode, setHoursMode] = useState<'Calendar Hours' | 'Business Hours'>('Calendar Hours');
  const [searchNav, setSearchNav] = useState('');
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [showAnalyzeModal, setShowAnalyzeModal] = useState(false);

  // Custom Dashboards state (Screenshot 000510 & 000518)
  const [selectedDashboardId, setSelectedDashboardId] = useState<number | null>(
    dashboards[0]?.id ?? null
  );
  const [showNewDashboardModal, setShowNewDashboardModal] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState('');
  const [editingDashboardId, setEditingDashboardId] = useState<number | null>(null);

  // Custom Report creation state
  const [showNewReportModal, setShowNewReportModal] = useState(false);
  const [newReportName, setNewReportName] = useState('');
  const [newReportMetric, setNewReportMetric] = useState('Active conversations');
  const [activeCustomReport, setActiveCustomReport] = useState<any>(null);

  // Export state (Screenshot 000525)
  const [exportMetric, setExportMetric] = useState('Active conversations');
  const [exportDateRange, setExportDateRange] = useState('Last 7 days');
  const [exportStatusFilter, setExportStatusFilter] = useState('');
  const [showFilterSelect, setShowFilterSelect] = useState(false);
  const [showColumnsSelect, setShowColumnsSelect] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'Conversation ID',
    'Subject',
    'Customer Email',
    'Status',
    'Priority',
    'Assignee',
    'Created At',
  ]);
  const [scheduleEmail, setScheduleEmail] = useState('');
  const [scheduleFrequency, setScheduleFrequency] = useState('Weekly');
  const [scheduleSavedMsg, setScheduleSavedMsg] = useState('');

  const fetchAnalytics = async () => {
    const q = selectedInboxId ? `?inbox_id=${selectedInboxId}` : '';
    const res = await fetch(`/api/analytics${q}`);
    const data = await res.json();
    setAnalyticsData(data);
  };

  useEffect(() => {
    fetchAnalytics();
  }, [selectedInboxId]);

  useEffect(() => {
    if (dashboards.length > 0 && !selectedDashboardId) {
      setSelectedDashboardId(dashboards[0].id);
    }
  }, [dashboards]);

  const handleCreateOrSaveDashboard = async () => {
    if (!newDashboardName.trim()) return;
    if (editingDashboardId) {
      await fetch(`/api/dashboards/${editingDashboardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newDashboardName.trim(),
          created_by: currentUserName || 'Admin',
        }),
      });
    } else {
      const res = await fetch('/api/dashboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newDashboardName.trim(),
          created_by: currentUserName || 'Admin',
        }),
      });
      const created = await res.json();
      setSelectedDashboardId(created.id);
    }
    setNewDashboardName('');
    setEditingDashboardId(null);
    setShowNewDashboardModal(false);
    onRefreshBootstrap();
    fetchAnalytics();
  };

  const handleCloneDashboard = async (dash: any) => {
    const res = await fetch('/api/dashboards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${dash.name} (Copy)`.slice(0, 65),
        created_by: currentUserName || 'Admin',
        widgets: dash.widgets,
      }),
    });
    const created = await res.json();
    setSelectedDashboardId(created.id);
    onRefreshBootstrap();
  };

  const handleDeleteDashboard = async (id: number) => {
    await fetch(`/api/dashboards/${id}`, { method: 'DELETE' });
    const remaining = dashboards.filter(d => d.id !== id);
    setSelectedDashboardId(remaining[0]?.id ?? null);
    onRefreshBootstrap();
  };

  const handleCreateCustomReport = async () => {
    if (!newReportName.trim()) return;
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newReportName.trim(),
        metric: newReportMetric,
        inbox_id: selectedInboxId ? Number(selectedInboxId) : null,
      }),
    });
    const created = await res.json();
    setNewReportName('');
    setShowNewReportModal(false);
    onRefreshBootstrap();
    setActiveCustomReport(created);
    setReportSection('custom_report');
  };

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (selectedInboxId) params.set('inbox_id', selectedInboxId);
    params.set('metric', exportMetric);
    if (exportStatusFilter) params.set('status', exportStatusFilter);
    window.open(`/api/exports/csv?${params.toString()}`, '_blank');
  };

  const handleSaveScheduledExport = async () => {
    if (!scheduleEmail.trim()) return;
    await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Scheduled: ${exportMetric}`,
        metric: exportMetric,
        inbox_id: selectedInboxId ? Number(selectedInboxId) : null,
        date_range: exportDateRange,
        schedule_frequency: scheduleFrequency,
        recipient_email: scheduleEmail.trim(),
      }),
    });
    setScheduleSavedMsg(`Scheduled ${scheduleFrequency.toLowerCase()} CSV export to ${scheduleEmail.trim()}.`);
    onRefreshBootstrap();
  };

  const series = analyticsData?.dailySeries || [];
  const maxVal = Math.max(10, ...series.map((d: any) => Number(d[workloadTab] || 0)));
  const currentDashboard = dashboards.find(d => d.id === selectedDashboardId) || null;

  const dateRangeLabel = (() => {
    if (series.length >= 2) {
      return `${series[0].label}, ${new Date().getFullYear()} - ${series[series.length - 1].label}, ${new Date().getFullYear()}`;
    }
    return 'Current 7-day period';
  })();

  return (
    <div className="fixed inset-0 z-50 bg-white flex overflow-hidden">
      {/* LEFT SIDEBAR: THREADLY Analytics */}
      <aside className="w-64 border-r border-[#E2E8F0] bg-white flex flex-col shrink-0">
        {/* Header */}
        <div className="px-5 pt-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ThreadlyAnalyticsIcon size={30} />
            <div>
              <div className="text-[11px] font-brand tracking-tight text-[#0F172A]">
                Thread<span className="text-[#DC2626]">ly</span>
              </div>
              <div className="text-xs font-semibold text-[#64748B] leading-tight">Analytics</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]"
            title="Close Analytics"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Top Switch Tabs: Reports | Dashboards */}
        <div className="grid grid-cols-2 border-b border-[#E2E8F0] px-2">
          <button
            onClick={() => setTopTab('reports')}
            className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              topTab === 'reports'
                ? 'border-[#DC2626] text-[#0F172A]'
                : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <FileBarChart2 className="w-3.5 h-3.5" />
            <span>Reports</span>
          </button>
          <button
            onClick={() => setTopTab('dashboards')}
            className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              topTab === 'dashboards'
                ? 'border-[#DC2626] text-[#0F172A]'
                : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Dashboards</span>
          </button>
        </div>

        {/* Inbox Selector & Search */}
        <div className="p-3 space-y-2.5">
          {topTab === 'reports' && (
            <div className="relative">
              <Inbox className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
              <select
                value={selectedInboxId}
                onChange={e => setSelectedInboxId(e.target.value)}
                className="w-full pl-8 pr-7 py-2 text-xs font-medium bg-white border border-[#E2E8F0] rounded-md text-[#0F172A] focus:outline-none focus:border-[#DC2626]"
              >
                <option value="">All Shared Inboxes</option>
                {inboxes.map(ib => (
                  <option key={ib.id} value={String(ib.id)}>
                    {ib.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchNav}
              onChange={e => setSearchNav(e.target.value)}
              placeholder="Search"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-md text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#DC2626]"
            />
          </div>
        </div>

        {/* Sidebar Navigation Content */}
        {topTab === 'reports' ? (
          <div className="flex-1 overflow-y-auto px-2 space-y-4">
            <div>
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-[#0F172A]">
                <FileBarChart2 className="w-3.5 h-3.5 text-[#64748B]" />
                <span>Reports</span>
              </div>
              <div className="mt-1 space-y-0.5">
                {[
                  { id: 'conversations', label: 'Conversations' },
                  { id: 'users', label: 'Users' },
                  { id: 'tags', label: 'Tags' },
                  { id: 'contacts', label: 'Contacts' },
                ]
                  .filter(item => item.label.toLowerCase().includes(searchNav.toLowerCase()))
                  .map(item => (
                    <button
                      key={item.id}
                      onClick={() => setReportSection(item.id as any)}
                      className={`w-full text-left px-6 py-2 rounded-r-full text-xs font-medium transition-colors ${
                        reportSection === item.id
                          ? 'bg-[#FEF2F2] text-[#991B1B] font-semibold'
                          : 'text-[#334155] hover:bg-[#F8FAFC]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
              </div>
            </div>

            {/* Custom reports */}
            <div className="border-t border-[#E2E8F0] pt-3">
              <div className="flex items-center justify-between px-3 py-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
                  <FileBarChart2 className="w-3.5 h-3.5 text-[#64748B]" />
                  <span>Custom reports</span>
                </div>
                <button
                  onClick={() => setShowNewReportModal(true)}
                  className="w-5 h-5 rounded-full border border-[#FCA5A5] text-[#DC2626] flex items-center justify-center hover:bg-[#FEF2F2]"
                  title="Create Custom Report"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              {customReports.length === 0 ? (
                <div className="px-6 py-2 text-xs text-[#94A3B8]">No custom report created</div>
              ) : (
                <div className="mt-1 space-y-0.5">
                  {customReports.map(cr => (
                    <button
                      key={cr.id}
                      onClick={() => {
                        setActiveCustomReport(cr);
                        setReportSection('custom_report');
                      }}
                      className={`w-full text-left px-6 py-1.5 rounded-r-full text-xs font-medium truncate ${
                        reportSection === 'custom_report' && activeCustomReport?.id === cr.id
                          ? 'bg-[#FEF2F2] text-[#991B1B] font-semibold'
                          : 'text-[#334155] hover:bg-[#F8FAFC]'
                      }`}
                    >
                      {cr.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Exports */}
            <div className="border-t border-[#E2E8F0] pt-3">
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-[#0F172A]">
                <Download className="w-3.5 h-3.5 text-[#64748B]" />
                <span>Exports</span>
              </div>
              <div className="mt-1 space-y-0.5">
                <button
                  onClick={() => setReportSection('new_export')}
                  className={`w-full text-left px-6 py-2 rounded-r-full text-xs font-medium transition-colors ${
                    reportSection === 'new_export'
                      ? 'bg-[#FEF2F2] text-[#991B1B] font-semibold'
                      : 'text-[#334155] hover:bg-[#F8FAFC]'
                  }`}
                >
                  New export
                </button>
                <button
                  onClick={() => setReportSection('schedule_export')}
                  className={`w-full text-left px-6 py-2 rounded-r-full text-xs font-medium transition-colors ${
                    reportSection === 'schedule_export'
                      ? 'bg-[#FEF2F2] text-[#991B1B] font-semibold'
                      : 'text-[#334155] hover:bg-[#F8FAFC]'
                  }`}
                >
                  Schedule export
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* DASHBOARDS SIDEBAR (Screenshot 000510 & 000518) */
          <div className="flex-1 overflow-y-auto px-2 pt-2">
            <div className="flex items-center justify-between px-3 py-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
                <LayoutGrid className="w-3.5 h-3.5 text-[#64748B]" />
                <span>Custom Dashboards</span>
              </div>
              <button
                onClick={() => {
                  setEditingDashboardId(null);
                  setNewDashboardName('');
                  setShowNewDashboardModal(true);
                }}
                className="w-5 h-5 rounded-full border border-[#FCA5A5] text-[#DC2626] flex items-center justify-center hover:bg-[#FEF2F2]"
                title="New Dashboard"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            <div className="mt-1 space-y-0.5">
              {dashboards
                .filter(d => d.name.toLowerCase().includes(searchNav.toLowerCase()))
                .map(d => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDashboardId(d.id)}
                    className={`w-full text-left px-6 py-2 rounded-r-full text-xs font-medium transition-colors ${
                      selectedDashboardId === d.id
                        ? 'bg-[#FEF2F2] text-[#991B1B] font-semibold'
                        : 'text-[#334155] hover:bg-[#F8FAFC]'
                    }`}
                  >
                    {d.name}
                  </button>
                ))}
            </div>
          </div>
        )}
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto bg-white px-8 py-6">
        {topTab === 'dashboards' ? (
          /* CUSTOM DASHBOARDS VIEW (Screenshot 000510 & 000518) */
          currentDashboard ? (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <h1 className="text-lg font-semibold text-[#0F172A]">{currentDashboard.name}</h1>
                  <button
                    onClick={() => {
                      setEditingDashboardId(currentDashboard.id);
                      setNewDashboardName(currentDashboard.name);
                      setShowNewDashboardModal(true);
                    }}
                    className="p-1.5 text-[#64748B] hover:text-[#0F172A] rounded"
                    title="Rename Dashboard"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleCloneDashboard(currentDashboard)}
                    className="p-1.5 text-[#64748B] hover:text-[#0F172A] rounded"
                    title="Clone Dashboard"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteDashboard(currentDashboard.id)}
                    className="p-1.5 text-[#64748B] hover:text-[#DC2626] rounded"
                    title="Delete Dashboard"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-4 text-xs text-[#334155]">
                  <button
                    onClick={fetchAnalytics}
                    className="flex items-center gap-1.5 hover:text-[#DC2626] font-medium"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Refresh</span>
                  </button>
                  <div className="flex items-center gap-1.5 border border-[#E2E8F0] rounded-md px-3 py-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#64748B]" />
                    <span>{dateRangeLabel}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />
                  </div>
                </div>
              </div>

              {/* Dashboard Metric Cards matching Screenshot 000518 */}
              {(analyticsData?.inboxSummaries || []).length === 0 ? (
                <div className="border border-dashed border-[#CBD5E1] rounded-lg p-10 text-center max-w-lg">
                  <div className="text-sm font-medium text-[#0F172A] mb-1">
                    No Shared Inboxes created yet
                  </div>
                  <p className="text-xs text-[#64748B]">
                    Create a Shared Inbox in the Admin Panel to see live New and Active conversation cards here.
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-4">
                  {(analyticsData?.inboxSummaries || []).map((summary: any) => (
                    <React.Fragment key={summary.inbox_id}>
                      <div className="w-60 border border-[#E2E8F0] rounded-lg p-5 bg-white shadow-sm">
                        <div className="flex items-center gap-2 text-xs text-[#475569] mb-2">
                          <Inbox className="w-3.5 h-3.5 text-[#DC2626]" />
                          <span>{summary.inbox_name}</span>
                        </div>
                        <div className="text-xs font-semibold text-[#0F172A] mb-3">
                          New conversations
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl font-semibold font-mono text-[#0F172A]">
                            {summary.new_conversations}
                          </span>
                          <span className="text-[11px] text-[#94A3B8]">-%</span>
                        </div>
                      </div>

                      <div className="w-60 border border-[#E2E8F0] rounded-lg p-5 bg-white shadow-sm">
                        <div className="flex items-center gap-2 text-xs text-[#475569] mb-2">
                          <Inbox className="w-3.5 h-3.5 text-[#DC2626]" />
                          <span>{summary.inbox_name}</span>
                        </div>
                        <div className="text-xs font-semibold text-[#0F172A] mb-3">
                          Active conversations
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl font-semibold font-mono text-[#0F172A]">
                            {summary.active_conversations}
                          </span>
                          <span className="text-[11px] text-[#94A3B8]">-%</span>
                        </div>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              )}

              <div className="mt-6 text-xs italic text-[#64748B]">
                Last edited by {currentDashboard.created_by || currentUserName || 'Admin'},{' '}
                {new Date(currentDashboard.updated_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          ) : (
            /* Empty state matching background of Screenshot 000510 */
            <div className="h-full flex items-center justify-center">
              <div className="max-w-xl w-full border border-[#E2E8F0] rounded-xl p-8 flex items-center justify-between gap-8 bg-[#F8FAFC]">
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold text-[#0F172A]">
                    Custom dashboards across shared inboxes
                  </h2>
                  <p className="text-xs text-[#64748B] leading-relaxed">
                    Get a consolidated view of key metrics across multiple shared inboxes at a glance.
                  </p>
                  <button
                    onClick={() => {
                      setEditingDashboardId(null);
                      setNewDashboardName('');
                      setShowNewDashboardModal(true);
                    }}
                    className="px-4 py-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-medium rounded-md transition-colors"
                  >
                    Create dashboard
                  </button>
                </div>
              </div>
            </div>
          )
        ) : reportSection === 'new_export' || reportSection === 'schedule_export' ? (
          /* CREATE AN EXPORT SCREEN (Screenshot 000525.png) */
          <div className="max-w-xl">
            <div className="flex items-start justify-between mb-8">
              <div>
                <h1 className="text-lg font-semibold text-[#0F172A]">
                  {reportSection === 'schedule_export' ? 'Schedule an export' : 'Create an export'}
                </h1>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Export data from any metric into a CSV file
                </p>
              </div>
              {reportSection === 'new_export' ? (
                <button
                  onClick={handleExportCsv}
                  className="px-4 py-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-medium rounded-md shadow-sm transition-colors"
                >
                  Export now
                </button>
              ) : (
                <button
                  onClick={handleSaveScheduledExport}
                  className="px-4 py-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-medium rounded-md shadow-sm transition-colors"
                >
                  Save schedule
                </button>
              )}
            </div>

            <div className="space-y-6">
              {/* Choose metric */}
              <div className="grid grid-cols-12 items-center gap-4">
                <div className="col-span-4 flex items-center gap-2 text-xs font-medium text-[#0F172A]">
                  <FileBarChart2 className="w-4 h-4 text-[#64748B]" />
                  <span>Choose metric</span>
                </div>
                <div className="col-span-8">
                  <select
                    value={exportMetric}
                    onChange={e => setExportMetric(e.target.value)}
                    className="w-full border-b border-[#CBD5E1] py-1.5 text-xs text-[#0F172A] bg-transparent focus:outline-none focus:border-[#DC2626]"
                  >
                    <option value="Active conversations">Active conversations</option>
                    <option value="New conversations">New conversations</option>
                    <option value="Resolved conversations">Resolved conversations</option>
                    <option value="All conversations">All conversations</option>
                  </select>
                </div>
              </div>

              {/* Select time period */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium text-[#0F172A]">
                  <Calendar className="w-4 h-4 text-[#64748B]" />
                  <span>Select time period</span>
                </div>
                <div className="grid grid-cols-12 items-center gap-4 pl-6">
                  <div className="col-span-4 text-xs text-[#334155]">Date range</div>
                  <div className="col-span-8">
                    <select
                      value={exportDateRange}
                      onChange={e => setExportDateRange(e.target.value)}
                      className="w-full border-b border-[#CBD5E1] py-1.5 text-xs text-[#0F172A] bg-transparent focus:outline-none focus:border-[#DC2626]"
                    >
                      <option value={dateRangeLabel}>{dateRangeLabel}</option>
                      <option value="Last 7 days">Last 7 days</option>
                      <option value="Last 30 days">Last 30 days</option>
                      <option value="All time">All time</option>
                    </select>
                  </div>
                </div>
              </div>

              {reportSection === 'schedule_export' && (
                <div className="grid grid-cols-12 items-center gap-4">
                  <div className="col-span-4 text-xs font-medium text-[#0F172A] pl-6">
                    Recipient email
                  </div>
                  <div className="col-span-8 flex gap-2">
                    <input
                      type="email"
                      value={scheduleEmail}
                      onChange={e => setScheduleEmail(e.target.value)}
                      placeholder="team@company.com"
                      className="flex-1 border-b border-[#CBD5E1] py-1.5 text-xs text-[#0F172A] focus:outline-none focus:border-[#DC2626]"
                    />
                    <select
                      value={scheduleFrequency}
                      onChange={e => setScheduleFrequency(e.target.value)}
                      className="border-b border-[#CBD5E1] py-1.5 text-xs text-[#0F172A] focus:outline-none"
                    >
                      <option value="Daily">Daily</option>
                      <option value="Weekly">Weekly</option>
                      <option value="Monthly">Monthly</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Filter by */}
              <div>
                <button
                  onClick={() => setShowFilterSelect(!showFilterSelect)}
                  className="flex items-center gap-2 text-xs font-medium text-[#0F172A] hover:text-[#DC2626]"
                >
                  <SlidersHorizontal className="w-4 h-4 text-[#64748B]" />
                  <span>Filter by</span>
                </button>
                {showFilterSelect && (
                  <div className="mt-2 pl-6">
                    <select
                      value={exportStatusFilter}
                      onChange={e => setExportStatusFilter(e.target.value)}
                      className="border border-[#E2E8F0] rounded-md px-3 py-1.5 text-xs text-[#0F172A]"
                    >
                      <option value="">All Statuses</option>
                      <option value="Open">Open only</option>
                      <option value="Pending">Pending only</option>
                      <option value="Closed">Closed only</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Choose columns */}
              <div>
                <button
                  onClick={() => setShowColumnsSelect(!showColumnsSelect)}
                  className="flex items-center gap-2 text-xs font-medium text-[#0F172A] hover:text-[#DC2626]"
                >
                  <Settings className="w-4 h-4 text-[#64748B]" />
                  <span>Choose columns</span>
                </button>
                {showColumnsSelect && (
                  <div className="mt-2 pl-6 grid grid-cols-2 gap-2">
                    {[
                      'Conversation ID',
                      'Subject',
                      'Customer Name',
                      'Customer Email',
                      'Status',
                      'Priority',
                      'Assignee',
                      'Shared Inbox',
                      'SLA Policy',
                      'Created At',
                    ].map(col => (
                      <label key={col} className="flex items-center gap-2 text-xs text-[#334155]">
                        <input
                          type="checkbox"
                          checked={selectedColumns.includes(col)}
                          onChange={e => {
                            if (e.target.checked) setSelectedColumns([...selectedColumns, col]);
                            else setSelectedColumns(selectedColumns.filter(c => c !== col));
                          }}
                          className="accent-[#DC2626]"
                        />
                        <span>{col}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {scheduleSavedMsg && (
                <div className="p-3 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B]">
                  {scheduleSavedMsg}
                </div>
              )}
            </div>
          </div>
        ) : reportSection === 'users' ? (
          /* USERS REPORT */
          <div>
            <h1 className="text-lg font-semibold text-[#0F172A] mb-6">Users Performance</h1>
            <div className="border border-[#E2E8F0] rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-semibold uppercase text-[#64748B]">
                    <th className="py-3 px-4">Team Member</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Total Assigned</th>
                    <th className="py-3 px-4">Active</th>
                    <th className="py-3 px-4">Resolved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-xs">
                  {(analyticsData?.userMetrics || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[#94A3B8]">
                        No users added yet. Add team members in Admin Panel &rarr; Users &amp; Roles.
                      </td>
                    </tr>
                  ) : (
                    analyticsData.userMetrics.map((u: any) => (
                      <tr key={u.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-3 px-4 font-medium text-[#0F172A]">
                          {u.name} <span className="text-[#64748B] font-normal">({u.email})</span>
                        </td>
                        <td className="py-3 px-4 text-[#475569]">{u.role}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] bg-[#ECFDF5] text-[#059669] font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
                            {u.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono">{u.assigned_total || 0}</td>
                        <td className="py-3 px-4 font-mono">{u.active_assigned || 0}</td>
                        <td className="py-3 px-4 font-mono">{u.resolved_assigned || 0}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : reportSection === 'tags' ? (
          /* TAGS REPORT */
          <div>
            <h1 className="text-lg font-semibold text-[#0F172A] mb-6">Tags Breakdown</h1>
            <div className="border border-[#E2E8F0] rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-semibold uppercase text-[#64748B]">
                    <th className="py-3 px-4">Tag Name</th>
                    <th className="py-3 px-4">Color</th>
                    <th className="py-3 px-4">Conversations Tagged</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-xs">
                  {(analyticsData?.tagMetrics || []).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-[#94A3B8]">
                        No tags created yet.
                      </td>
                    </tr>
                  ) : (
                    analyticsData.tagMetrics.map((t: any) => (
                      <tr key={t.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-3 px-4">
                          <span
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
                            style={{
                              borderColor: t.color,
                              color: t.color,
                              backgroundColor: `${t.color}12`,
                            }}
                          >
                            {t.name}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[#64748B]">{t.color}</td>
                        <td className="py-3 px-4 font-mono font-semibold text-[#0F172A]">
                          {t.count || 0}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : reportSection === 'contacts' ? (
          /* CONTACTS REPORT */
          <div>
            <h1 className="text-lg font-semibold text-[#0F172A] mb-6">Customer Contacts</h1>
            <div className="border border-[#E2E8F0] rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-semibold uppercase text-[#64748B]">
                    <th className="py-3 px-4">Customer Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Total Conversations</th>
                    <th className="py-3 px-4">Active</th>
                    <th className="py-3 px-4">Last Contacted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-xs">
                  {(analyticsData?.contactMetrics || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[#94A3B8]">
                        No customer contacts recorded yet.
                      </td>
                    </tr>
                  ) : (
                    analyticsData.contactMetrics.map((c: any, idx: number) => (
                      <tr key={idx} className="hover:bg-[#F8FAFC]">
                        <td className="py-3 px-4 font-medium text-[#0F172A]">{c.customer_name}</td>
                        <td className="py-3 px-4 text-[#475569]">{c.customer_email}</td>
                        <td className="py-3 px-4 font-mono">{c.total_conversations}</td>
                        <td className="py-3 px-4 font-mono">{c.active_conversations}</td>
                        <td className="py-3 px-4 text-[#64748B]">
                          {new Date(c.last_contacted_at).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* CONVERSATIONS REPORT (Screenshot 000504.png) */
          <div>
            {/* Top Bar */}
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-lg font-semibold text-[#0F172A]">
                {reportSection === 'custom_report' && activeCustomReport
                  ? activeCustomReport.name
                  : 'Conversations'}
              </h1>
              <div className="flex items-center gap-4 text-xs text-[#334155]">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#64748B]" />
                  <span>{dateRangeLabel}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />
                </div>
                <button
                  onClick={() =>
                    setHoursMode(
                      hoursMode === 'Calendar Hours' ? 'Business Hours' : 'Calendar Hours'
                    )
                  }
                  className="flex items-center gap-1.5 text-[#64748B] hover:text-[#0F172A]"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>{hoursMode}</span>
                </button>
              </div>
            </div>

            {/* Workload Section */}
            <div className="mb-8">
              <h2 className="text-xs font-semibold text-[#0F172A] mb-3">Workload</h2>
              <div className="flex items-center gap-6 border-b border-[#E2E8F0]">
                {[
                  { id: 'active', label: 'Active' },
                  { id: 'new', label: 'New' },
                  { id: 'resolved', label: 'Resolved' },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setWorkloadTab(t.id as any)}
                    className={`pb-2.5 text-xs font-medium border-b-2 transition-colors ${
                      workloadTab === t.id
                        ? 'border-[#DC2626] text-[#DC2626] font-semibold'
                        : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Chart Container matching Screenshot 000504 */}
              <div className="mt-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-[#0F172A]">
                      <span>
                        {workloadTab === 'active'
                          ? 'Active conversations'
                          : workloadTab === 'new'
                          ? 'New conversations'
                          : 'Resolved conversations'}
                      </span>
                      <HelpCircle className="w-3.5 h-3.5 text-[#94A3B8]" />
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-2xl font-semibold font-mono text-[#0F172A]">
                        {workloadTab === 'active'
                          ? analyticsData?.totals?.active_conversations || 0
                          : workloadTab === 'new'
                          ? analyticsData?.totals?.total_conversations || 0
                          : analyticsData?.totals?.resolved_conversations || 0}
                      </span>
                      <span className="text-[11px] text-[#94A3B8]">-%</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAnalyzeModal(true)}
                    className="px-3.5 py-1.5 border border-[#DC2626] text-[#DC2626] hover:bg-[#FEF2F2] rounded text-xs font-medium transition-colors"
                  >
                    Analyze
                  </button>
                </div>

                {/* Interactive SVG Line Chart */}
                <div className="relative pl-8 pt-4 pb-6">
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 origin-center text-[9px] font-semibold tracking-wider text-[#64748B] uppercase whitespace-nowrap">
                    NO. OF CONVERSATIONS
                  </div>

                  <svg className="w-full h-56 overflow-visible" viewBox="0 0 700 200">
                    {[0, 0.2, 0.4, 0.6, 0.8, 1].map((ratio, idx) => {
                      const y = 180 - ratio * 160;
                      const val = Math.round(ratio * maxVal);
                      return (
                        <g key={idx}>
                          <line
                            x1={30}
                            y1={y}
                            x2={680}
                            y2={y}
                            stroke="#E2E8F0"
                            strokeWidth="1"
                          />
                          <text
                            x={20}
                            y={y + 4}
                            textAnchor="end"
                            className="text-[10px] fill-[#64748B] font-mono"
                          >
                            {val}
                          </text>
                        </g>
                      );
                    })}

                    {/* Polyline */}
                    {series.length > 0 && (
                      <>
                        <polyline
                          fill="none"
                          stroke="#DC2626"
                          strokeWidth="2"
                          points={series
                            .map((d: any, i: number) => {
                              const x = 30 + (i / Math.max(1, series.length - 1)) * 650;
                              const val = Number(d[workloadTab] || 0);
                              const y = 180 - (val / maxVal) * 160;
                              return `${x},${y}`;
                            })
                            .join(' ')}
                        />

                        {series.map((d: any, i: number) => {
                          const x = 30 + (i / Math.max(1, series.length - 1)) * 650;
                          const val = Number(d[workloadTab] || 0);
                          const y = 180 - (val / maxVal) * 160;
                          const isHovered = hoveredIdx === i;
                          return (
                            <g
                              key={d.date}
                              onMouseEnter={() => setHoveredIdx(i)}
                              onMouseLeave={() => setHoveredIdx(null)}
                              className="cursor-pointer"
                            >
                              {isHovered && (
                                <line
                                  x1={x}
                                  y1={20}
                                  x2={x}
                                  y2={180}
                                  stroke="#CBD5E1"
                                  strokeDasharray="3 3"
                                />
                              )}
                              <circle
                                cx={x}
                                cy={y}
                                r={isHovered ? 5 : 3.5}
                                fill="#FFFFFF"
                                stroke="#DC2626"
                                strokeWidth="2.5"
                              />
                              <text
                                x={x}
                                y={198}
                                textAnchor="middle"
                                className="text-[10px] fill-[#64748B]"
                              >
                                {d.label}
                              </text>

                              {isHovered && (
                                <foreignObject
                                  x={Math.min(580, Math.max(30, x - 45))}
                                  y={Math.max(5, y - 62)}
                                  width="96"
                                  height="52"
                                >
                                  <div className="bg-[#1E293B] text-white rounded-md px-2.5 py-1.5 text-[11px] shadow-lg">
                                    <div className="text-[#CBD5E1] font-medium">{d.label}</div>
                                    <div className="flex items-center gap-1.5 font-mono font-semibold mt-0.5">
                                      <Mail className="w-3 h-3 text-[#F87171]" />
                                      <span>{val}</span>
                                    </div>
                                  </div>
                                </foreignObject>
                              )}
                            </g>
                          );
                        })}
                      </>
                    )}
                  </svg>

                  <div className="text-center text-[10px] font-semibold tracking-wider text-[#0F172A] uppercase mt-2">
                    DAILY
                  </div>
                </div>
              </div>
            </div>

            {/* Performance Section matching Screenshot 000504 */}
            <div>
              <h2 className="text-xs font-semibold text-[#0F172A] mb-3">Performance</h2>
              <div className="flex items-center gap-6 border-b border-[#E2E8F0]">
                {[
                  { id: 'frt', label: 'First response time' },
                  { id: 'fat', label: 'First assign time' },
                  { id: 'rt', label: 'Response time' },
                  { id: 'rest', label: 'Resolution time' },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setPerfTab(t.id as any)}
                    className={`pb-2.5 text-xs font-medium border-b-2 transition-colors ${
                      perfTab === t.id
                        ? 'border-[#DC2626] text-[#DC2626] font-semibold'
                        : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-6">
                <div className="text-xs font-medium text-[#0F172A]">
                  {perfTab === 'frt'
                    ? 'Average First Response Time'
                    : perfTab === 'fat'
                    ? 'Average First Assign Time'
                    : perfTab === 'rt'
                    ? 'Average Response Time'
                    : 'Average Resolution Time'}
                </div>
                <div className="mt-2 text-2xl font-semibold font-mono text-[#0F172A]">
                  {perfTab === 'frt'
                    ? `${analyticsData?.totals?.avg_first_response_mins || 0} mins`
                    : perfTab === 'fat'
                    ? `${analyticsData?.totals?.avg_first_assign_mins || 0} mins`
                    : perfTab === 'rt'
                    ? `${analyticsData?.totals?.avg_first_response_mins || 0} mins`
                    : `${analyticsData?.totals?.avg_resolution_mins || 0} mins`}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* NEW DASHBOARD MODAL (Exact match to Screenshot 000510.png) */}
      {showNewDashboardModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-[#0F172A]">
                {editingDashboardId ? 'Edit dashboard' : 'New dashboard'}
              </h3>
              <button
                onClick={() => setShowNewDashboardModal(false)}
                className="text-[#64748B] hover:text-[#0F172A]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-6">
              <label className="block text-xs font-medium text-[#475569] mb-1.5">Name</label>
              <div className="flex items-center border-b border-[#CBD5E1] focus-within:border-[#DC2626] pb-1.5">
                <input
                  type="text"
                  maxLength={65}
                  value={newDashboardName}
                  onChange={e => setNewDashboardName(e.target.value)}
                  placeholder="Dashboard name"
                  autoFocus
                  className="flex-1 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none"
                />
                <span className="text-[11px] font-mono text-[#94A3B8]">
                  {newDashboardName.length}/65
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowNewDashboardModal(false)}
                className="px-4 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#F1F5F9] rounded"
              >
                Cancel
              </button>
              <button
                disabled={!newDashboardName.trim()}
                onClick={handleCreateOrSaveDashboard}
                className={`px-4 py-1.5 text-xs font-medium rounded transition-colors ${
                  newDashboardName.trim()
                    ? 'bg-[#DC2626] text-white hover:bg-[#B91C1C]'
                    : 'bg-[#E2E8F0] text-[#94A3B8] cursor-not-allowed'
                }`}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW CUSTOM REPORT MODAL */}
      {showNewReportModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#0F172A]">Create custom report</h3>
              <button
                onClick={() => setShowNewReportModal(false)}
                className="text-[#64748B] hover:text-[#0F172A]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">Report name</label>
                <input
                  type="text"
                  value={newReportName}
                  onChange={e => setNewReportName(e.target.value)}
                  placeholder="e.g. Weekly SLA & Backlog"
                  className="w-full border border-[#E2E8F0] rounded-md px-3 py-2 text-xs text-[#0F172A] focus:outline-none focus:border-[#DC2626]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1">Primary metric</label>
                <select
                  value={newReportMetric}
                  onChange={e => setNewReportMetric(e.target.value)}
                  className="w-full border border-[#E2E8F0] rounded-md px-3 py-2 text-xs text-[#0F172A]"
                >
                  <option value="Active conversations">Active conversations</option>
                  <option value="New conversations">New conversations</option>
                  <option value="Resolved conversations">Resolved conversations</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewReportModal(false)}
                className="px-4 py-1.5 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9] rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCustomReport}
                className="px-4 py-1.5 text-xs font-medium bg-[#DC2626] text-white hover:bg-[#B91C1C] rounded"
              >
                Create report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ANALYZE DRILLDOWN MODAL */}
      {showAnalyzeModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#0F172A]">Workload Breakdown Analysis</h3>
              <button
                onClick={() => setShowAnalyzeModal(false)}
                className="text-[#64748B] hover:text-[#0F172A]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="border border-[#E2E8F0] rounded-lg p-3">
                <div className="text-[11px] text-[#64748B]">Open</div>
                <div className="text-lg font-mono font-semibold text-[#DC2626]">
                  {analyticsData?.totals?.open_conversations || 0}
                </div>
              </div>
              <div className="border border-[#E2E8F0] rounded-lg p-3">
                <div className="text-[11px] text-[#64748B]">Pending</div>
                <div className="text-lg font-mono font-semibold text-[#D97706]">
                  {analyticsData?.totals?.pending_conversations || 0}
                </div>
              </div>
              <div className="border border-[#E2E8F0] rounded-lg p-3">
                <div className="text-[11px] text-[#64748B]">Closed / Resolved</div>
                <div className="text-lg font-mono font-semibold text-[#059669]">
                  {analyticsData?.totals?.resolved_conversations || 0}
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowAnalyzeModal(false)}
                className="px-4 py-1.5 bg-[#0F172A] text-white text-xs font-medium rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
