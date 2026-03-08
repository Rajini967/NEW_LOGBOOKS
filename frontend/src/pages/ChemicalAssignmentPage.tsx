import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { chemicalAssignmentAPI, chemicalStockAPI } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

// Map display labels from stock API to backend filter keys
const LOCATION_DISPLAY_TO_KEY: Record<string, string> = {
  "Water system": "water_system",
  "Cooling towers": "cooling_towers",
  "Boiler": "boiler",
};
function locationDisplayToKey(display: string): string {
  const key = LOCATION_DISPLAY_TO_KEY[display];
  if (key) return key;
  const lower = display.trim().toLowerCase();
  if (lower.includes("water") && !lower.includes("cooling")) return "water_system";
  if (lower.includes("cooling")) return "cooling_towers";
  if (lower === "boiler") return "boiler";
  return display;
}

interface AssignmentRow {
  id: string;
  chemical: string;
  chemical_name: string;
  chemical_formula: string;
  location: string;
  equipment_name: string;
  category: "major" | "minor";
  is_active: boolean;
  created_by_name?: string | null;
}

const ChemicalAssignmentPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "manager" || user?.role === "super_admin";

  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [form, setForm] = useState<{
    location: string;
    chemicalFormula: string;
    chemicalName: string;
    equipmentName: string;
    category: "major" | "minor" | "";
    selectedChemicalId: string | null;
  }>({
    location: "",
    chemicalFormula: "",
    chemicalName: "",
    equipmentName: "",
    category: "",
    selectedChemicalId: null,
  });

  const [stockByLocation, setStockByLocation] = useState<any[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [locationsFromStock, setLocationsFromStock] = useState<{ value: string; label: string }[]>([]);

  const loadAssignments = async () => {
    setIsLoading(true);
    try {
      const data = await chemicalAssignmentAPI.list();
      setRows(data as any);
    } catch (error: any) {
      console.error("Failed to load assignments:", error);
      toast.error(error?.message || "Failed to load assignments");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadAssignments();
  }, []);

  // Load distinct locations from stock details (only locations that have stock entries)
  useEffect(() => {
    let cancelled = false;
    chemicalStockAPI
      .list()
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        const seen = new Set<string>();
        const locations: { value: string; label: string }[] = [];
        for (const row of list) {
          const display = String(row.location ?? "").trim();
          if (!display || seen.has(display)) continue;
          seen.add(display);
          const key = locationDisplayToKey(display);
          locations.push({ value: key, label: display });
        }
        locations.sort((a, b) => a.label.localeCompare(b.label));
        setLocationsFromStock(locations);
      })
      .catch(() => {
        if (!cancelled) setLocationsFromStock([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // When location is selected, fetch stock for that location so we can show chemical dropdown
  useEffect(() => {
    if (!form.location) {
      setStockByLocation([]);
      return;
    }
    let cancelled = false;
    setStockLoading(true);
    chemicalStockAPI
      .list({ location: form.location })
      .then((data) => {
        if (!cancelled) setStockByLocation(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setStockByLocation([]);
      })
      .finally(() => {
        if (!cancelled) setStockLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.location]);

  // Unique chemicals from stock (by chemical id) for dropdown
  const chemicalsFromStock = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; chemical_name: string; chemical_formula: string; display: string }[] = [];
    for (const row of stockByLocation) {
      const id = row.chemical ?? row.chemical_id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const name = String(row.chemical_name ?? "").trim();
      const formula = String(row.chemical_formula ?? "").trim();
      out.push({
        id,
        chemical_name: name,
        chemical_formula: formula,
        display: formula ? `${formula} – ${name}` : name || id,
      });
    }
    return out.sort((a, b) => a.display.localeCompare(b.display));
  }, [stockByLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const chemicalName = form.chemicalName.trim();
    const equipmentName = form.equipmentName.trim();
    if (!chemicalName) {
      toast.error("Please enter chemical name.");
      return;
    }
    if (!equipmentName) {
      toast.error("Please enter equipment name.");
      return;
    }
    if (!form.category) {
      toast.error("Please select a category (Major/Minor).");
      return;
    }
    try {
      await chemicalAssignmentAPI.create({
        chemical: form.selectedChemicalId || undefined,
        location: form.location.trim() || undefined,
        chemical_formula: form.chemicalFormula.trim() || undefined,
        chemical_name: chemicalName,
        equipment_name: equipmentName,
        category: form.category,
      });
      toast.success("Chemical assigned to equipment.");
      setForm({
        location: "",
        chemicalFormula: "",
        chemicalName: "",
        equipmentName: "",
        category: "",
        selectedChemicalId: null,
      });
      await loadAssignments();
    } catch (error: any) {
      console.error("Failed to save assignment:", error);
      toast.error(error?.message || "Failed to save assignment");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Remove this chemical assignment?")) return;
    try {
      await chemicalAssignmentAPI.delete(id);
      toast.success("Assignment removed.");
      await loadAssignments();
    } catch (error: any) {
      console.error("Failed to delete assignment:", error);
      toast.error(error?.message || "Failed to delete assignment");
    }
  };

  return (
    <div className="min-h-screen">
      <Header
        title="Chemical Equipment Assignment"
        subtitle="Assign chemicals and category to equipment"
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

        {!isAdmin && (
          <Badge variant="outline" className="text-xs">
            View only – assignments can be edited by managers.
          </Badge>
        )}
      </div>

      <main className="p-6">
        <div className="max-w-5xl mx-auto space-y-8">
          {isAdmin && (
            <section className="bg-card border border-border rounded-lg p-4 space-y-4">
              <h2 className="text-lg font-semibold">New assignment</h2>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Select
                    value={form.location || "__none__"}
                    onValueChange={(v) =>
                      setForm((prev) => ({
                        ...prev,
                        location: v === "__none__" ? "" : v,
                        chemicalFormula: "",
                        chemicalName: "",
                        selectedChemicalId: null,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select location</SelectItem>
                      {locationsFromStock.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Only locations that have stock entries are listed. Chemicals at this location will appear below.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Chemical (from stock at selected location)</Label>
                  <Select
                    value={form.selectedChemicalId ?? "__none__"}
                    onValueChange={(v) => {
                      if (v === "__none__") {
                        setForm((prev) => ({
                          ...prev,
                          selectedChemicalId: null,
                          chemicalName: "",
                          chemicalFormula: "",
                        }));
                        return;
                      }
                      const chem = chemicalsFromStock.find((c) => c.id === v);
                      if (chem) {
                        setForm((prev) => ({
                          ...prev,
                          selectedChemicalId: chem.id,
                          chemicalName: chem.chemical_name,
                          chemicalFormula: chem.chemical_formula,
                        }));
                      }
                    }}
                    disabled={!form.location || stockLoading || chemicalsFromStock.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={stockLoading ? "Loading..." : form.location ? "Select chemical" : "Select location first"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select chemical</SelectItem>
                      {chemicalsFromStock.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.display}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.location && !stockLoading && chemicalsFromStock.length === 0 && (
                    <p className="text-xs text-amber-600">
                      No stock entries at this location. Add stock in Chemical Stock Details first.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="equipment-name">Equipment</Label>
                  <Input
                    id="equipment-name"
                    value={form.equipmentName}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, equipmentName: e.target.value }))
                    }
                    placeholder="Enter equipment name"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) =>
                      setForm((prev) => ({
                        ...prev,
                        category: v as "major" | "minor",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="major">Major</SelectItem>
                      <SelectItem value="minor">Minor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button type="submit" className="w-full">
                    Save assignment
                  </Button>
                </div>
              </form>
            </section>
          )}

          <section className="bg-card border border-border rounded-lg">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-semibold">Current assignments</h2>
              <Badge variant="secondary">
                {rows.length} {rows.length === 1 ? "assignment" : "assignments"}
              </Badge>
            </div>
            <div className="min-w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Equipment
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Chemical
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Category
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Location
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Created by
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        Loading assignments...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        No assignments configured yet.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-t border-border hover:bg-muted/40"
                      >
                        <td className="px-4 py-2">{row.equipment_name}</td>
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
                          <Badge variant="outline">
                            {row.category === "major" ? "Major" : "Minor"}
                          </Badge>
                        </td>
                        <td className="px-4 py-2">{row.location}</td>
                        <td className="px-4 py-2">
                          {row.created_by_name || "-"}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {isAdmin ? (
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 text-rose-600"
                              onClick={() => void handleDelete(row.id)}
                              title="Delete assignment"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default ChemicalAssignmentPage;
