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
  let cleaned = text;

  cleaned = cleaned.replace(/\s+is\s+(?:headquartered|located)\s+(?:in|at)\s+/i, " ");

  cleaned = cleaned.replace(/\.\s+Contact\s+(?:details|information|number)[^.]*$/i, "");
  cleaned = cleaned.replace(/\.\s+(?:Tel|Phone|Email|Website)[^.]*$/i, "");
  cleaned = cleaned.replace(/\s+Contact\s+(?:details|number|information)[^.]*$/i, "");
  cleaned = cleaned.replace(/\s+\+\d+\s+\d+\s+\d+\s+\d+.*$/i, "");
  cleaned = cleaned.replace(/\s+[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}.*$/i, "");
  cleaned = cleaned.replace(/\s+and\s+\+\d+.*$/i, "");
  cleaned = cleaned.replace(/\s+(?:The office|Nigeria office)[^.]*at\s+/i, " ");

  const addressMatch = cleaned.match(/(\d+[^,]*(?:Street|Road|Avenue|Way|Crescent|Close|Drive|Boulevard|Plaza|Complex|District|Area|Lane|Building|House)[^.]*)/i);
  if (addressMatch) {
    let addr = addressMatch[1].trim();
    addr = addr.replace(/\s+(?:Contact|Tel|Phone|Email|Website|Operating|Open)[^.]*$/i, "").trim();
    addr = addr.replace(/\s+\+\d+.*$/i, "").trim();
    addr = addr.replace(/\s+[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}.*$/i, "").trim();
    return addr;
  }

  cleaned = cleaned.split(/\.\s+/)[0].trim();
  cleaned = cleaned.replace(/^[^A-Z0-9]*/, "").trim();
  cleaned = cleaned.replace(/\s+(?:Contact|Tel|Phone|Email|Website|Operating|Open)[^.]*$/i, "").trim();
  cleaned = cleaned.replace(/\s+\+\d+.*$/i, "").trim();
  cleaned = cleaned.replace(/\s+[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}.*$/i, "").trim();

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
