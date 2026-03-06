export interface CompanyRow {
  company_name: string;
  original_address: string;
  original_state: string;
}

export function parseCSV(csvText: string): CompanyRow[] {
  const lines = csvText.trim().split('\n');
  const companies: CompanyRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);

    if (values.length >= 1) {
      companies.push({
        company_name: values[0] || '',
        original_address: values[1] || '',
        original_state: values[2] || '',
      });
    }
  }

  return companies;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

export function generateCSV(companies: any[]): string {
  const headers = ['Company Name', 'Original Address', 'Original State', 'Searched Address', 'Searched State', 'Status'];
  const rows = companies.map(company => [
    escapeCSVValue(company.company_name),
    escapeCSVValue(company.original_address),
    escapeCSVValue(company.original_state),
    escapeCSVValue(company.searched_address),
    escapeCSVValue(company.searched_state),
    escapeCSVValue(company.search_status),
  ]);

  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

function escapeCSVValue(value: string): string {
  if (!value) return '';

  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function generateSampleCSV(): string {
  const headers = ['Company Name', 'Address', 'State'];
  const sampleData = [
    ['Example Company Limited', 'Victoria Island', 'Lagos'],
    ['Tech Solutions Nigeria', 'Lekki', 'Lagos'],
    ['Manufacturing Corp', 'Yaba', 'Lagos'],
    ['Finance Group PLC', 'Ikoyi', 'Lagos'],
    ['Innovation Hub', 'Abuja', 'FCT'],
    ['Energy Services Ltd', 'Port Harcourt', 'Rivers'],
    ['Trading Company', 'Kano', 'Kano'],
    ['Logistics Network', 'Ibadan', 'Oyo'],
    ['Construction Group', 'Enugu', 'Enugu'],
    ['Healthcare Solutions', 'Kaduna', 'Kaduna'],
  ];

  return [headers, ...sampleData].map(row => row.join(',')).join('\n');
}
