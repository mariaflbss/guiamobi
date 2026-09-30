import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export interface DraftPlace {
  label: string;
  latitude: number;
  longitude: number;
}

interface RouteDraftValue {
  origin: DraftPlace | null;
  destination: DraftPlace | null;
  setOrigin: (place: DraftPlace | null) => void;
  setDestination: (place: DraftPlace | null) => void;
  setBoth: (origin: DraftPlace | null, destination: DraftPlace | null) => void;
}

const RouteDraftContext = createContext<RouteDraftValue | undefined>(undefined);

/**
 * Origem e destino em edição. A tela de busca de endereço (PlaceSearch)
 * grava aqui o local escolhido (já com latitude/longitude obtidos da
 * geocodificação) e a Home lê para montar a busca de rotas.
 */
export function RouteDraftProvider({ children }: { children: React.ReactNode }) {
  const [origin, setOrigin] = useState<DraftPlace | null>(null);
  const [destination, setDestination] = useState<DraftPlace | null>(null);

  const setBoth = useCallback((nextOrigin: DraftPlace | null, nextDestination: DraftPlace | null) => {
    setOrigin(nextOrigin);
    setDestination(nextDestination);
  }, []);

  const value = useMemo(
    () => ({ origin, destination, setOrigin, setDestination, setBoth }),
    [origin, destination, setBoth]
  );

  return <RouteDraftContext.Provider value={value}>{children}</RouteDraftContext.Provider>;
}

export function useRouteDraft(): RouteDraftValue {
  const context = useContext(RouteDraftContext);
  if (!context) {
    throw new Error('useRouteDraft deve ser usado dentro de um RouteDraftProvider');
  }
  return context;
}
