import { useState, useRef } from 'react';
import { Upload, Download, Search, AlertCircle, CheckCircle, FileText } from 'lucide-react';
import { supabase } from './lib/supabase';
import { parseCSV, generateCSV, downloadCSV, generateSampleCSV } from './utils/csv';

interface Company {
  id: string;
  company_name: string;
  original_address: string;
  original_state: string;
  searched_address: string;
  searched_state: string;
  search_status: string;
}

function App() {
  const [batchId, setBatchId] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const text = await file.text();
      const parsedCompanies = parseCSV(text);

      if (parsedCompanies.length === 0) {
        throw new Error('No valid company data found in CSV');
      }

      const newBatchId = crypto.randomUUID();

      const companiesWithBatchId = parsedCompanies.map(company => ({
        ...company,
        batch_id: newBatchId,
      }));

      const { data, error: insertError } = await supabase
        .from('companies')
        .insert(companiesWithBatchId)
        .select();

      if (insertError) throw insertError;

      setBatchId(newBatchId);
      setCompanies(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload CSV');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSearch = async () => {
    if (!batchId) return;

    setSearching(true);
    setError(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search-companies`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batchId }),
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const pollInterval = setInterval(async () => {
        const { data, error: fetchError } = await supabase
          .from('companies')
          .select('*')
          .eq('batch_id', batchId)
          .order('created_at', { ascending: true });

        if (fetchError) {
          clearInterval(pollInterval);
          setError(fetchError.message);
          setSearching(false);
          return;
        }

        setCompanies(data || []);

        const allCompleted = data?.every(
          company => company.search_status === 'completed' || company.search_status === 'failed'
        );

        if (allCompleted) {
          clearInterval(pollInterval);
          setSearching(false);
        }
      }, 2000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setSearching(false);
    }
  };

  const handleDownload = () => {
    if (companies.length === 0) return;

    const csv = generateCSV(companies);
    const timestamp = new Date().toISOString().split('T')[0];
    downloadCSV(csv, `companies_enriched_${timestamp}.csv`);
  };

  const handleDownloadTemplate = () => {
    const csv = generateSampleCSV();
    downloadCSV(csv, 'companies_template.csv');
  };

  const stats = {
    total: companies.length,
    pending: companies.filter(c => c.search_status === 'pending').length,
    processing: companies.filter(c => c.search_status === 'processing').length,
    completed: companies.filter(c => c.search_status === 'completed').length,
    failed: companies.filter(c => c.search_status === 'failed').length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-800 mb-2">
              Nigerian Company Address Finder
            </h1>
            <p className="text-slate-600 mb-4">
              Upload a CSV with company names to automatically find detailed street addresses and states
            </p>
            <button
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              <FileText className="w-4 h-4" />
              Download Sample Template
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-800">Error</h3>
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                id="csv-upload"
              />
              <label
                htmlFor="csv-upload"
                className={`flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium cursor-pointer hover:bg-blue-700 transition-colors ${
                  uploading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <Upload className="w-5 h-5" />
                {uploading ? 'Uploading...' : 'Upload CSV'}
              </label>

              {companies.length > 0 && (
                <>
                  <button
                    onClick={handleSearch}
                    disabled={searching || stats.pending === 0}
                    className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Search className="w-5 h-5" />
                    {searching ? 'Searching...' : `Search (${stats.pending} pending)`}
                  </button>

                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-2 px-6 py-3 bg-slate-700 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors"
                  >
                    <Download className="w-5 h-5" />
                    Download Results
                  </button>
                </>
              )}
            </div>
          </div>

          {companies.length > 0 && (
            <>
              <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
                <h2 className="text-lg font-semibold text-slate-800 mb-4">Progress</h2>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-slate-800">{stats.total}</div>
                    <div className="text-sm text-slate-600">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-slate-500">{stats.pending}</div>
                    <div className="text-sm text-slate-600">Pending</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{stats.processing}</div>
                    <div className="text-sm text-slate-600">Processing</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
                    <div className="text-sm text-slate-600">Completed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
                    <div className="text-sm text-slate-600">Failed</div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                          Company Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                          Searched Address
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                          State
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {companies.map((company) => (
                        <tr key={company.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm text-slate-800 font-medium">
                            {company.company_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {company.searched_address || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {company.searched_state || '-'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                                company.search_status === 'completed'
                                  ? 'bg-green-100 text-green-800'
                                  : company.search_status === 'failed'
                                  ? 'bg-red-100 text-red-800'
                                  : company.search_status === 'processing'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-slate-100 text-slate-800'
                              }`}
                            >
                              {company.search_status === 'completed' && (
                                <CheckCircle className="w-3 h-3" />
                              )}
                              {company.search_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {companies.length === 0 && (
            <div className="bg-white rounded-xl shadow-lg p-12 text-center">
              <Upload className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-800 mb-2">
                No CSV uploaded yet
              </h3>
              <p className="text-slate-600 mb-4">
                Upload a CSV file with company names to get started
              </p>
              <p className="text-sm text-slate-500">
                CSV should have columns: Company Name, Address, State
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
