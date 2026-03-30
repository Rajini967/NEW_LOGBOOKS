import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Thermometer, Gauge, Droplets, Filter as FilterIcon, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface EquipmentModule {
  id: string;
  name: string;
  description: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const equipmentModules: EquipmentModule[] = [
  {
    id: 'chiller',
    name: 'Chiller',
    description: 'Monitor chiller temperature, pressure, and flow readings',
    path: '/e-log-book/chiller',
    icon: Thermometer,
    color: 'bg-blue-500',
  },
  {
    id: 'boiler',
    name: 'Boiler',
    description: 'Track boiler feed water, steam, and oil temperature',
    path: '/e-log-book/boiler',
    icon: Gauge,
    color: 'bg-orange-500',
  },
  {
    id: 'chemical',
    name: 'Chemical',
    description: 'Manage chemical preparation and solution concentrations',
    path: '/e-log-book/chemical',
    icon: Droplets,
    color: 'bg-green-500',
  },
  {
    id: 'filter',
    name: 'Filter',
    description: 'Log filter integrity, cleaning, and replacement details',
    path: '/e-log-book/filter',
    icon: FilterIcon,
    color: 'bg-teal-500',
  },
  {
    id: 'consumption',
    name: 'Consumption',
    description: 'View weekly consumption across chemical, steam, and fuel',
    path: '/e-log-book/consumption',
    icon: BarChart3,
    color: 'bg-violet-500',
  },
];

export default function ELogBookLandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const isFilterAdmin = user && (user.role === 'admin' || user.role === 'super_admin');
  const isChemicalAdmin = user && (user.role === 'admin' || user.role === 'super_admin');

  return (
    <div className="min-h-screen">
      <Header
        title="E Log Book"
        subtitle="Select an equipment module to manage log entries"
      />

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {equipmentModules.map((module) => {
            const IconComponent = module.icon;
            return (
              <button
                key={module.id}
                onClick={() => {
                  if (module.id === 'filter') {
                    if (isFilterAdmin) {
                      navigate('/e-log-book/filter');
                    } else {
                      navigate('/e-log-book/filter/entry');
                    }
                  } else if (module.id === 'chemical') {
                    if (isChemicalAdmin) {
                      navigate('/e-log-book/chemical');
                    } else {
                      navigate('/e-log-book/chemical/entry');
                    }
                  } else {
                    navigate(module.path);
                  }
                }}
                className={cn(
                  'bg-card rounded-lg border border-border p-6',
                  'hover:border-accent hover:shadow-lg',
                  'transition-all duration-200',
                  'text-left group',
                  'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2'
                )}
              >
                <div className="flex flex-col items-start gap-4">
                  <div
                    className={cn(
                      'w-16 h-16 rounded-lg flex items-center justify-center',
                      'group-hover:scale-110 transition-transform duration-200',
                      module.color,
                      'text-white'
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
