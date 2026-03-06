import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Company {
  id: string;
  company_name: string;
  original_address: string;
  original_state: string;
}

function extractCleanAddress(text: string): string {
  const addressPatterns = [
    /(?:Address:|Located at:|Office:|Headquarters:)\s*([^.]+(?:Street|Road|Avenue|Way|Crescent|Close|Drive|Boulevard|Plaza|Complex|District|Area|Zone|Floor|Building|House|Lane)[^.]*)/i,
    /(\d+[^.]*(?:Street|Road|Avenue|Way|Crescent|Close|Drive|Boulevard|Plaza|Complex|District|Area|Zone|Floor|Building|House|Lane)[^.]*)/i,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|Road|Avenue|Way|Crescent|Close|Drive|Boulevard|Plaza|Complex|District|Area|Zone)[^,.]*(?:,\s*[^,.]+)*)/,
  ];

  for (const pattern of addressPatterns) {
    const match = text.match(pattern);
    if (match) {
      let addr = match[1] || match[0];
      addr = addr.replace(/^(?:Address:|Located at:|Office:|Headquarters:)\s*/i, "").trim();
      addr = addr.replace(/\s*(?:Contact|Tel|Phone|Email|Website|Operating|Open|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[^.]*$/i, "").trim();
      addr = addr.replace(/\s*\+?\d{3}[\s-]?\d{3}[\s-]?\d{4}.*$/g, "").trim();
      addr = addr.replace(/\s*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}.*$/g, "").trim();
      addr = addr.replace(/\s*(?:from|operates|open)\s+\d+[AP]M.*$/i, "").trim();
      addr = addr.replace(/[,;]\s*$/, "").trim();

      if (addr.length > 15 && addr.length < 200) {
        return addr;
      }
    }
  }

  let cleaned = text.split(/\.\s+/)[0];
  cleaned = cleaned.replace(/^[^A-Z0-9]*/, "").trim();
  cleaned = cleaned.replace(/\s*(?:Contact|Tel|Phone|Email|Website|Operating|Open|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[^.]*$/i, "").trim();
  cleaned = cleaned.replace(/\s*\+?\d{3}[\s-]?\d{3}[\s-]?\d{4}.*$/g, "").trim();
  cleaned = cleaned.replace(/\s*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}.*$/g, "").trim();
  cleaned = cleaned.replace(/\s*(?:from|operates|open)\s+\d+[AP]M.*$/i, "").trim();
  cleaned = cleaned.replace(/[,;]\s*$/, "").trim();

  return cleaned;
}

async function searchCompanyInfo(companyName: string, tavilyApiKey: string): Promise<{ address: string; state: string }> {
  try {
    const searchQuery = `"${companyName}" Nigeria office address street location`;

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: tavilyApiKey,
        query: searchQuery,
        search_depth: "advanced",
        include_answer: true,
        max_results: 5,
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.statusText}`);
    }

    const data = await response.json();

    let rawAddress = "";
    let state = "";

    if (data.answer) {
      rawAddress = data.answer.trim();
    } else if (data.results && data.results.length > 0) {
      for (const result of data.results) {
        const content = result.content || "";
        if (content.length > 50) {
          rawAddress = content;
          break;
        }
      }
    }

    if (!rawAddress && data.results && data.results.length > 0) {
      rawAddress = data.results[0].content || "";
    }

    rawAddress = rawAddress.replace(new RegExp(`^${companyName}\\s*[,:-]*\\s*`, "i"), "").trim();

    let address = extractCleanAddress(rawAddress);

    const nigerianStates = [
      "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue",
      "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu",
      "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi",
      "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo",
      "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara", "FCT"
    ];

    for (const stateName of nigerianStates) {
      if (address.toLowerCase().includes(stateName.toLowerCase())) {
        state = stateName;
        break;
      }
    }

    return { address, state };
  } catch (error) {
    console.error("Search error:", error);
    throw error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { batchId, companyId } = await req.json();

    if (!batchId && !companyId) {
      return new Response(
        JSON.stringify({ error: "batchId or companyId required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const tavilyApiKey = Deno.env.get("TAVILY_API_KEY");

    if (!tavilyApiKey) {
      return new Response(
        JSON.stringify({ error: "TAVILY_API_KEY not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    let query = supabase
      .from("companies")
      .select("*")
      .eq("search_status", "pending");

    if (companyId) {
      query = query.eq("id", companyId);
    } else if (batchId) {
      query = query.eq("batch_id", batchId);
    }

    const { data: companies, error: fetchError } = await query;

    if (fetchError) {
      throw fetchError;
    }

    if (!companies || companies.length === 0) {
      return new Response(
        JSON.stringify({ message: "No pending companies found", processed: 0 }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let processed = 0;
    let failed = 0;

    for (const company of companies as Company[]) {
      try {
        await supabase
          .from("companies")
          .update({ search_status: "processing", updated_at: new Date().toISOString() })
          .eq("id", company.id);

        const { address, state } = await searchCompanyInfo(company.company_name, tavilyApiKey);

        await supabase
          .from("companies")
          .update({
            searched_address: address,
            searched_state: state,
            search_status: "completed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", company.id);

        processed++;

        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        failed++;
        await supabase
          .from("companies")
          .update({
            search_status: "failed",
            search_error: error instanceof Error ? error.message : "Unknown error",
            updated_at: new Date().toISOString(),
          })
          .eq("id", company.id);
      }
    }

    return new Response(
      JSON.stringify({
        message: "Search completed",
        processed,
        failed,
        total: companies.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
