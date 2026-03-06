import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { chemicalStockAPI } from "@/lib/api";
import { toast } from "sonner";

interface ChemicalStockRow {
  id: string;
  chemical_name: string;
  chemical_formula: string;
  location: string;
  available_qty_kg: number;
  unit: string;
  price_per_unit: number | null;
  site: string | null;
}

const ChemicalStockPage: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ChemicalStockRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [locationFilter, setLocationFilter] = useState<"all" | "water_system" | "cooling_towers" | "boiler">("all");

  const load = async (location?: "water_system" | "cooling_towers" | "boiler") => {
    setIsLoading(true);
    try {
      const params = location ? { location } : undefined;
      const data = await chemicalStockAPI.list(params);
      setRows(data as any);
    } catch (error: any) {
      console.error("Failed to load chemical stock:", error);
      toast.error(error?.message || "Failed to load chemical stock");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (locationFilter === "all") {
      void load();
    } else {
      void load(locationFilter);
    }
  }, [locationFilter]);

  return (
    <div className="min-h-screen">
      <Header
        title="Chemical Stock Details"
        subtitle="View current chemical stock and price information"
      />

      <div className="px-6 pt-2 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => navigate("/e-log-book/chemical")}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </button>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Location</span>
          <Select
            value={locationFilter}
            onValueChange={(v) =>
              setLocationFilter(v as "all" | "water_system" | "cooling_towers" | "boiler")
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              <SelectItem value="water_system">Water system</SelectItem>
              <SelectItem value="cooling_towers">Cooling towers</SelectItem>
              <SelectItem value="boiler">Boiler</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <main className="p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="min-w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Location
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Chemical
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Stock
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Price
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Site
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Loading stock...</span>
                        </div>
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        No stock records found.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-t border-border hover:bg-muted/40"
                      >
                        <td className="px-4 py-2">{row.location}</td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {row.chemical_formula}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {row.chemical_name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          {row.available_qty_kg} {row.unit || "kg"}
                        </td>
                        <td className="px-4 py-2">
                          {row.price_per_unit != null
                            ? `${row.price_per_unit} per ${row.unit || "kg"}`
                            : "—"}
                        </td>
                        <td className="px-4 py-2">
                          {row.site || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ChemicalStockPage;
