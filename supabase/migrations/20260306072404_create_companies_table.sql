/*
  # Create Companies Data Table

  1. New Tables
    - `companies`
      - `id` (uuid, primary key) - Unique identifier for each company record
      - `batch_id` (uuid) - Groups companies from the same CSV upload
      - `company_name` (text) - Name of the Nigerian company
      - `original_address` (text) - Address from uploaded CSV (may be incomplete)
      - `original_state` (text) - State from uploaded CSV (may be incomplete)
      - `searched_address` (text) - Detailed address found through web search
      - `searched_state` (text) - State found through web search
      - `search_status` (text) - Status: pending, processing, completed, failed
      - `search_error` (text) - Error message if search failed
      - `created_at` (timestamptz) - When the record was created
      - `updated_at` (timestamptz) - When the record was last updated
      
  2. Security
    - Enable RLS on `companies` table
    - Add policies for public access (since no auth is required for this tool)
    
  3. Indexes
    - Index on batch_id for efficient batch queries
    - Index on search_status for filtering pending searches
*/

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  company_name text NOT NULL,
  original_address text DEFAULT '',
  original_state text DEFAULT '',
  searched_address text DEFAULT '',
  searched_state text DEFAULT '',
  search_status text DEFAULT 'pending',
  search_error text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access"
  ON companies FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow public insert access"
  ON companies FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow public update access"
  ON companies FOR UPDATE
  TO anon
  USING (true);

CREATE INDEX IF NOT EXISTS idx_companies_batch_id ON companies(batch_id);
CREATE INDEX IF NOT EXISTS idx_companies_search_status ON companies(search_status);