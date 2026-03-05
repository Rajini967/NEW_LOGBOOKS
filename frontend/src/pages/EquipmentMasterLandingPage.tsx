import React from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Wrench, Filter as FilterIcon, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";

interface EquipmentMasterModule {
  id: string;
  name: string;
  description: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const masterModules: EquipmentMasterModule[] = [
  {
    id: "departments",
    name: "Departments",
    description: "Manage equipment departments used across logbooks",
    path: "/equipment/departments",
    icon: Wrench,
    color: "bg-blue-500",
  },
  {
    id: "categories",
    name: "Equipment Categories",
    description: "Define categories like chillers, boilers, HVAC, and more",
    path: "/equipment/categories",
    icon: FilterIcon,
    color: "bg-green-500",
  },
  {
    id: "equipment",
    name: "Equipment List",
    description: "Register and maintain master equipment details",
    path: "/equipment/list",
    icon: Gauge,
    color: "bg-orange-500",
  },
];

export default function EquipmentMasterLandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      <Header
        title="Equipment Master"
        subtitle="Select a master to manage equipment-related configuration"
      />

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {masterModules.map((module) => {
            const IconComponent = module.icon;
            return (
              <button
                key={module.id}
                onClick={() => navigate(module.path)}
                className={cn(
                  "bg-card rounded-lg border border-border p-6",
                  "hover:border-accent hover:shadow-lg",
                  "transition-all duration-200",
                  "text-left group",
                  "focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
                )}
              >
                <div className="flex flex-col items-start gap-4">
                  <div
                    className={cn(
                      "w-16 h-16 rounded-lg flex items-center justify-center",
                      "group-hover:scale-110 transition-transform duration-200",
                      module.color,
                      "text-white"
                    )}
                  >
                    <IconComponent className="w-8 h-8" />
                  </div>

                  <div className="flex-1 w-full">
                    <h3 className="text-xl font-semibold text-foreground mb-2 group-hover:text-accent transition-colors">
                      {module.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {module.description}
                    </p>
                  </div>

                  <div className="w-full flex items-center justify-between text-sm text-accent group-hover:text-accent/80">
                    <span className="font-medium">Open Module</span>
                    <span className="group-hover:translate-x-1 transition-transform">
                      →
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

