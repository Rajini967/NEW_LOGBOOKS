import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { chemicalStockAPI } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

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
  const { user } = useAuth();
  const isAdmin = user?.role === "manager" || user?.role === "super_admin";

  const [rows, setRows] = useState<ChemicalStockRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [locationFilter, setLocationFilter] = useState<"all" | "water_system" | "cooling_towers" | "boiler">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createForm, setCreateForm] = useState({
    location: "",
    chemicalName: "",
    chemicalFormula: "",
    stock: "",
    price: "",
    site: "",
  });

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

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const location = createForm.location.trim();
    const chemicalName = createForm.chemicalName.trim();
    const chemicalFormula = createForm.chemicalFormula.trim();
    if (!location) {
      toast.error("Location is required.");
      return;
    }
    if (!chemicalName) {
      toast.error("Chemical name is required.");
      return;
    }
    const stock = createForm.stock.trim() ? parseFloat(createForm.stock) : 0;
    if (Number.isNaN(stock) || stock < 0) {
      toast.error("Stock must be a number >= 0.");
      return;
    }
    const price = createForm.price.trim() ? parseFloat(createForm.price) : undefined;
    if (price !== undefined && (Number.isNaN(price) || price < 0)) {
      toast.error("Price must be a number >= 0.");
      return;
    }
    setCreateSubmitting(true);
    try {
      await chemicalStockAPI.createEntry({
        location,
        chemical_name: chemicalName,
        chemical_formula: chemicalFormula || undefined,
        stock,
        price: price ?? null,
        site: createForm.site.trim() || null,
      });
      toast.success("New stock entry created.");
      setCreateForm({
        location: "",
        chemicalName: "",
        chemicalFormula: "",
        stock: "",
        price: "",
        site: "",
      });
      setCreateOpen(false);
      void load(locationFilter === "all" ? undefined : locationFilter);
    } catch (error: any) {
      console.error("Failed to create stock entry:", error);
      toast.error(error?.message || "Failed to create stock entry");
    } finally {
      setCreateSubmitting(false);
    }
  };

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

        <div className="flex items-center gap-3">
          {isAdmin && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create new entry
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[70vh] flex flex-col">
                <DialogHeader className="shrink-0">
                  <DialogTitle>Create new stock entry</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateSubmit} className="space-y-3 mt-2 overflow-y-auto flex-1 min-h-0">
                  <div className="space-y-2">
                    <Label htmlFor="new-location">Location</Label>
                    <Input
                      id="new-location"
                      value={createForm.location}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, location: e.target.value }))
                      }
                      placeholder="e.g. Water system, Cooling towers, Boiler"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-chemical-name">Chemical Name</Label>
                    <Input
                      id="new-chemical-name"
                      value={createForm.chemicalName}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, chemicalName: e.target.value }))
                      }
                      placeholder="Enter chemical name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-chemical-formula">Chemical Formula (optional)</Label>
                    <Input
                      id="new-chemical-formula"
                      value={createForm.chemicalFormula}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, chemicalFormula: e.target.value }))
                      }
                      placeholder="e.g. NaOH, NaCl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-stock">Stock (kg)</Label>
                    <Input
                      id="new-stock"
                      type="number"
                      min={0}
                      step="any"
                      value={createForm.stock}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, stock: e.target.value }))
                      }
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-price">Price (per kg)</Label>
                    <Input
                      id="new-price"
                      type="number"
                      min={0}
                      step="any"
                      value={createForm.price}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, price: e.target.value }))
                      }
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-site">Site</Label>
                    <Input
                      id="new-site"
                      value={createForm.site}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, site: e.target.value }))
                      }
                      placeholder="Optional"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCreateOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createSubmitting}>
                      {createSubmitting ? "Saving..." : "Save entry"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
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
