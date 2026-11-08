import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock3, CircleHelp, Flag, MapPin, Repeat, X } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { AccessibleText } from '../components/AccessibleText';
import { AppDialog } from '../components/AppDialog';
import { AccessibleButton } from '../components/AccessibleButton';
import { InlineMessage } from '../components/InlineMessage';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { RouteMap } from '../components/RouteMap';
import { RouteBottomSheet } from '../components/RouteBottomSheet';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useLineDetail } from '../hooks/useLineDetail';
import { useVehiclePositions } from '../hooks/useVehiclePositions';
import { useNearbyPois } from '../hooks/useNearbyPois';
import { useNearbyLines } from '../hooks/useNearbyLines';
import { useFavorites } from '../hooks/useFavorites';
import { useStopAddress } from '../hooks/useStopAddress';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { useConnectivity } from '../hooks/useConnectivity';
import { locationService } from '../services/location/locationService';
import { AppStackParamList } from '../navigation/types';
import { Coordinates } from '../types/location';
import { distanceMeters } from '../utils/geo';
import { speechService } from '../services/speech/speechService';
import { hapticsService } from '../services/haptics/hapticsService';
import { movementService } from '../services/api/movementService';
import { offlineMapService } from '../services/storage/offlineMapService';

type Props = NativeStackScreenProps<AppStackParamList, 'Tracking'>;

// Distâncias (m) usadas para os avisos e para considerar uma parada "passada"
const ALERT_DISTANCE_METERS = 200;
const ARRIVAL_DISTANCE_METERS = 40;
const PASSED_DISTANCE_METERS = 40;
const AVERAGE_BUS_METERS_PER_MINUTE = 333; // ~20 km/h
const OFF_ROUTE_THRESHOLD_METERS = 120;
const DEMO_DEVIATION_START_PROGRESS = 0.28;
const DEMO_DEVIATION_END_PROGRESS = 0.36;
const DEMO_DEVIATION_OFFSET_METERS = 220;

// Demonstração da US13: durante a simulação, a primeira parada intermediária
// do trecho é tratada como uma parada de alta movimentação, escolhida mais
// adiante na viagem para não disparar no embarque. Isso deixa o teste
// determinístico, sem depender de outro usuário ativo no backend. Em produção
// real, o backend continua sendo a fonte de verdade quando a simulação estiver
// desativada.
const DEMO_HIGH_MOVEMENT_IN_SIMULATION = true;
const DEMO_HIGH_MOVEMENT_MIN_PROGRESS = 0.55;

/**
 * Acompanhamento da viagem (mockup 07). A posição vem do GPS do próprio
 * aparelho (não há posição do ônibus em tempo real): a tela compara a
 * posição do usuário com as paradas reais da linha para mostrar a próxima
 * parada, quantas faltam e a distância até o destino. A ~200 m do destino
 * abre o alerta "Prepare-se!" e, ao chegar, a tela de chegada.
 */
export function TrackingScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { theme, announce, settings, language } = useAccessibility();
  const p = route.params;
  const queueTripSpeech = useCallback((message: string) => {
    if (!message.trim()) return;
    speechService.prefetch(message, language);
    if (settings.feedbackMode === 'voz' || settings.feedbackMode === 'voz_vibracao') {
      speechService.enqueue(message, { rate: settings.speechRate, language });
    }
  }, [language, settings.feedbackMode, settings.speechRate]);

  // A tela anterior já possui o trecho e o traçado calculados. Reutilizamos
  // esses dados para a navegação, evitando uma segunda chamada à API ao tocar
  // em "Iniciar viagem". O fallback continua sendo o carregamento normal
  // quando a tela for aberta sem dados pré-carregados.
  const prefetchedLine = useMemo(() => p.stops?.length ? {
    id: p.lineId,
    code: p.lineCode,
    name: p.lineName,
    stops: p.stops,
    shape: p.shape,
    status: 'OPERATIONAL' as const,
    delayMinutes: null,
    hasRouteData: true,
    officialSourceUrl: null,
  } : null, [p.lineId, p.lineCode, p.lineName, p.stops, p.shape]);
  const { line, isLoading, errorMessage } = useLineDetail(p.lineId, prefetchedLine);
  const { favorites } = useFavorites();
  const insets = useSafeAreaInsets();
  useStatusBarStyle('light');
  const c = theme.colors;
  const isFocused = useIsFocused();
  const { isConnected } = useConnectivity(false);
  const offlineMode = Boolean(p.offlineSaved && !isConnected);
  const { vehicles } = useVehiclePositions(p.lineId, isFocused && !offlineMode);

  const [user, setUser] = useState<Coordinates | null>(null);
  const userRef = useRef<Coordinates | null>(null);
  // A viagem iniciada pela apresentação usa a simulação automaticamente.
  // Não há botão de simulação na interface: repetir e cancelar continuam sendo
  // as únicas ações disponíveis durante o acompanhamento.
  const simulationMode = true;
  const [simulationRunning, setSimulationRunning] = useState(false);
  const simulationElapsedRef = useRef(0);
  const [simulationProgress, setSimulationProgress] = useState(0);
  const [activePanel, setActivePanel] = useState<'tracking' | 'route' | 'options'>('tracking');
  const [highMovementDialogVisible, setHighMovementDialogVisible] = useState(false);
  const [cancelDialogVisible, setCancelDialogVisible] = useState(false);
  const [offRouteDialogVisible, setOffRouteDialogVisible] = useState(false);
  const [simulationDeviationActive, setSimulationDeviationActive] = useState(false);
  const expectedSimulationPositionRef = useRef<Coordinates | null>(null);
  const [traveledPath, setTraveledPath] = useState<Coordinates[]>([]);
  const lastTraveledPointRef = useRef<Coordinates | null>(null);
  // Favoritos são pessoais e devem permanecer destacados no mapa independentemente
  // da distância atual do usuário. O raio de 1 km vale apenas para os POIs de orientação.
  const nearbyFavorites = favorites;
  const [permissionDenied, setPermissionDenied] = useState(false);
  const passedIndexRef = useRef<number>(-1);
  const alertedRef = useRef(false);
  const arrivedRef = useRef(false);
  const lastSpokenStopRef = useRef<string | null>(null);
  // Evita que o anúncio periódico consulte uma referência inexistente e
  // permite reiniciar o controle a cada nova viagem.
  const lastPeriodicAnnouncementRef = useRef(0);
  const lastHighMovementAlertRef = useRef<string | null>(null);
  const offRouteAlertedRef = useRef(false);
  const startedAt = useRef(new Date().toISOString()).current;

  const stops = useMemo(() => line?.stops ?? [], [line]);
  const boardingIndex = stops.findIndex((s) => s.stop.id === p.boardingStopId);
  const destinationIndex = stops.findIndex((s) => s.stop.id === p.alightingStopId);

  // Prepara a mensagem crítica de 200 m desde o início da viagem. Assim,
  // quando o alerta aparecer, normalmente o MP3 já estará no cache local e
  // a fala não dependerá de uma chamada de rede naquele instante.
  useEffect(() => {
    if (destinationIndex < 0 || !stops[destinationIndex]?.stop?.name) return;
    const alertText = t('stopAlert.spoken', { name: stops[destinationIndex].stop.name });
    if (isFocused) speechService.prefetch(alertText, language);
  }, [destinationIndex, stops, language, t]);
  const ready = stops.length > 0 && boardingIndex >= 0 && destinationIndex > boardingIndex;

  const rawRouteShape = useMemo(() => {
    const shape = (line?.shape?.length ?? 0) > 1 ? line!.shape! : (p.shape && p.shape.length > 1 ? p.shape : []);
    return shape.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  }, [line?.shape, p.shape]);

  const nearestShapeIndex = useMemo(() => (point: Coordinates, shape: Coordinates[]) => {
    let best = 0;
    let bestDistance = Infinity;
    shape.forEach((candidate, index) => {
      const d = distanceMeters(point, candidate);
      if (d < bestDistance) { bestDistance = d; best = index; }
    });
    return best;
  }, []);

  // Recorta o traçado real entre embarque e destino. Assim a simulação não
  // percorre um trecho anterior/posterior da linha e nunca precisa ligar
  // paradas com uma reta artificial.
  const simulationPath = useMemo(() => {
    if (!ready) return [];
    const boarding = stops[boardingIndex].stop;
    const destination = stops[destinationIndex].stop;
    if (rawRouteShape.length > 1) {
      const boardingShapeIndex = nearestShapeIndex(boarding, rawRouteShape);
      const destinationShapeIndex = nearestShapeIndex(destination, rawRouteShape);
      const start = Math.min(boardingShapeIndex, destinationShapeIndex);
      const end = Math.max(boardingShapeIndex, destinationShapeIndex);
      const sliced = rawRouteShape.slice(start, end + 1);
      // Alguns feeds publicam o shape no sentido inverso ao trecho escolhido.
      // A simulação precisa sempre iniciar na parada de embarque e terminar
      // na parada de destino, independentemente da orientação original.
      const ordered = boardingShapeIndex <= destinationShapeIndex ? sliced : sliced.reverse();
      if (ordered.length > 1) return ordered;
    }
    return [boarding, destination];
  }, [ready, stops, boardingIndex, destinationIndex, rawRouteShape, nearestShapeIndex]);

  // Modo demonstração: reduzimos o tempo para os testes da sprint sem
  // transformar a viagem em uma animação instantânea. O limite de 2 minutos
  // mantém viagens longas testáveis e ainda dá tempo para perceber as
  // atualizações de paradas, POIs e avisos de acessibilidade.
  const stopCountForSimulation = Math.max(1, destinationIndex - boardingIndex);
  const SIMULATION_MS_PER_STOP = 6_000;
  const MIN_SIMULATION_DURATION_MS = 60_000;
  const MAX_SIMULATION_DURATION_MS = 90_000;
  const totalDurationMs = Math.min(
    MAX_SIMULATION_DURATION_MS,
    Math.max(MIN_SIMULATION_DURATION_MS, stopCountForSimulation * SIMULATION_MS_PER_STOP),
  );

  const simulationStopProgress = useMemo(() => {
    if (!simulationRunning || !ready || simulationPath.length < 2) return null;
    // A simulação é uma demonstração acelerada: distribuir as paradas em
    // etapas sequenciais evita que stops próximos ou shapes pouco densos
    // sejam marcados como ultrapassados no mesmo tick.
    const stopCount = Math.max(1, destinationIndex - boardingIndex);
    return Array.from({ length: stopCount + 1 }, (_, index) => index / stopCount);
  }, [simulationRunning, ready, simulationPath.length, boardingIndex, destinationIndex]);

  // A simulação começa assim que a viagem está pronta, como no fluxo original
  // de demonstração. O usuário não precisa ativar um modo separado.
  useEffect(() => {
    if (!ready || !isFocused || simulationPath.length < 2 || simulationRunning) return;
    setSimulationProgress(0);
    setTraveledPath([]);
    lastTraveledPointRef.current = null;
    passedIndexRef.current = boardingIndex - 1;
    alertedRef.current = false;
    arrivedRef.current = false;
    lastSpokenStopRef.current = null;
    lastPeriodicAnnouncementRef.current = 0;
    lastHighMovementAlertRef.current = null;
    offRouteAlertedRef.current = false;
    setSimulationDeviationActive(false);
    expectedSimulationPositionRef.current = null;
    setOffRouteDialogVisible(false);
    setHighMovementDialogVisible(false);
    setHighMovementStopId(null);
    simulationElapsedRef.current = 0;
    setUser(simulationPath[0] ?? stops[boardingIndex]?.stop ?? null);
    setSimulationRunning(true);
  }, [ready, isFocused, simulationPath, boardingIndex, stops, simulationRunning]);

  useEffect(() => {
    if (!simulationRunning || !isFocused || simulationPath.length < 2 || !ready) return;
    if (simulationElapsedRef.current === 0) setUser(simulationPath[0]);
    const intervalMs = 100;
    const interval = setInterval(() => {
      // Alertas modais pausam o relógio da simulação. Assim nenhuma parada
      // é ultrapassada enquanto o usuário lê ou responde a um aviso.
      if (offRouteDialogVisible || highMovementDialogVisible || cancelDialogVisible) return;
      simulationElapsedRef.current += intervalMs;
      const elapsed = Math.min(simulationElapsedRef.current, totalDurationMs);
      const globalProgress = Math.min(1, elapsed / totalDurationMs);
      setSimulationProgress(globalProgress);

      const scaledPosition = globalProgress * (simulationPath.length - 1);
      const segment = Math.min(Math.floor(scaledPosition), simulationPath.length - 2);
      const fraction = Math.min(1, scaledPosition - segment);
      const from = simulationPath[segment];
      const to = simulationPath[segment + 1];
      const basePosition = {
        latitude: from.latitude + (to.latitude - from.latitude) * fraction,
        longitude: from.longitude + (to.longitude - from.longitude) * fraction,
      };

      // US14: em modo de demonstração, criamos um desvio curto e
      // determinístico do traçado esperado. A posição desviada continua sendo
      // a localização atual da simulação, portanto pode ser usada como nova
      // origem quando o usuário escolher "Reiniciar rota".
      const inDeviationWindow =
        globalProgress >= DEMO_DEVIATION_START_PROGRESS &&
        globalProgress <= DEMO_DEVIATION_END_PROGRESS;
      expectedSimulationPositionRef.current = basePosition;
      setSimulationDeviationActive(inDeviationWindow);

      if (inDeviationWindow && segment + 1 < simulationPath.length) {
        const latDelta = to.latitude - from.latitude;
        const lonDelta = to.longitude - from.longitude;
        const metersPerLat = 111_320;
        const metersPerLon = Math.max(1, 111_320 * Math.cos((basePosition.latitude * Math.PI) / 180));
        const northMeters = latDelta * metersPerLat;
        const eastMeters = lonDelta * metersPerLon;
        const length = Math.hypot(northMeters, eastMeters) || 1;
        const perpendicularNorth = -eastMeters / length;
        const perpendicularEast = northMeters / length;

        setUser({
          latitude: basePosition.latitude + (perpendicularNorth * DEMO_DEVIATION_OFFSET_METERS) / metersPerLat,
          longitude: basePosition.longitude + (perpendicularEast * DEMO_DEVIATION_OFFSET_METERS) / metersPerLon,
        });
      } else {
        setUser(basePosition);
      }
      if (elapsed >= totalDurationMs) clearInterval(interval);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [simulationRunning, isFocused, simulationPath, ready, totalDurationMs, offRouteDialogVisible, highMovementDialogVisible, cancelDialogVisible]);

  // Mantém o histórico do trecho já percorrido para desenhar uma linha
  // acompanhando o usuário no mapa. Amostramos a cada ~15 m para evitar
  // centenas de pontos praticamente idênticos no componente nativo.
  useEffect(() => {
    userRef.current = user;
    if (!user) return;
    const last = lastTraveledPointRef.current;
    if (last && distanceMeters(last, user) < 15) return;
    lastTraveledPointRef.current = user;
    setTraveledPath((current) => {
      if (current.length === 0) return [user];
      return [...current, user];
    });
  }, [user]);

  // US14: compara a posição simulada atual com a coordenada esperada
  // naquele mesmo instante. O cenário injeta um deslocamento de 220 m, e a
  // detecção só é avaliada enquanto esse deslocamento está ativo.
  useEffect(() => {
    if (!simulationRunning || !isFocused || !user || !simulationDeviationActive || offRouteAlertedRef.current) return;
    if (offRouteDialogVisible || highMovementDialogVisible || cancelDialogVisible) return;
    const expected = expectedSimulationPositionRef.current;
    if (!expected) return;
    const distance = distanceMeters(user, expected);
    if (distance <= OFF_ROUTE_THRESHOLD_METERS) return;

    offRouteAlertedRef.current = true;
    setOffRouteDialogVisible(true);
    queueTripSpeech(t('tracking.offRouteAlert'));
    if (settings.feedbackMode === 'voz_vibracao' || settings.feedbackMode === 'vibracao') {
      hapticsService.warning();
    }
  }, [user, simulationRunning, simulationDeviationActive, isFocused, offRouteDialogVisible, highMovementDialogVisible, cancelDialogVisible, queueTripSpeech, settings.feedbackMode, t]);

  // GPS real: mantém o comportamento de produção quando não estamos simulando.
  useEffect(() => {
    if (simulationMode) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      let status = await locationService.getPermissionStatus();
      if (status !== 'granted') status = await locationService.requestPermission();
      if (status !== 'granted') {
        if (!cancelled) setPermissionDenied(true);
        return;
      }
      try {
        const coordinates = await locationService.getCurrentPosition();
        if (!cancelled) setUser(coordinates);
      } catch {}
      if (cancelled) return;
      const unsubscribe = await locationService.watchPosition((coordinates) => setUser(coordinates));
      if (cancelled) unsubscribe();
      else stop = unsubscribe;
    })();
    return () => { cancelled = true; stop?.(); };
  }, [simulationMode]);

  // Progresso ao longo da linha (nunca volta para trás) e próxima parada.
  const progress = useMemo(() => {
    if (!ready) return null;
    const dest = stops[destinationIndex].stop;
    const destination = { latitude: dest.latitude, longitude: dest.longitude };

    let passed = Math.max(passedIndexRef.current, boardingIndex - 1);
    if (simulationRunning && simulationStopProgress) {
      for (let local = 0; local < simulationStopProgress.length - 1; local += 1) {
        if (simulationStopProgress[local] <= simulationProgress + 0.000001) {
          passed = Math.max(passed, boardingIndex + local);
        }
      }
      passed = Math.min(passed, destinationIndex - 1);
      passedIndexRef.current = passed;
    } else if (user) {
      for (let i = boardingIndex; i <= destinationIndex; i += 1) {
        const stop = stops[i].stop;
        if (distanceMeters(user, stop) <= PASSED_DISTANCE_METERS && i > passed) passed = Math.min(i, destinationIndex - 1);
      }
      passedIndexRef.current = passed;
    }

    const nextIndex = Math.min(passed + 1, destinationIndex);
    const nextStop = stops[nextIndex].stop;
    const toNext = user ? distanceMeters(user, nextStop) : null;
    const toDestination = user ? distanceMeters(user, destination) : null;

    return {
      nextIndex,
      nextStopId: nextStop.id,
      nextName: nextStop.name,
      toNext,
      toDestination,
      remaining: Math.max(destinationIndex - passed, 0),
      passedIndex: passed,
    };
  }, [ready, stops, boardingIndex, destinationIndex, user, simulationRunning, simulationProgress, simulationStopProgress]);

  // Dados reais para o mapa (US09): POIs do OpenStreetMap ao redor do usuário e
  // endereço real (rua/número, quando o OSM tem) da próxima parada.
  const nearbyPois = useNearbyPois(user, isFocused && !offlineMode);
  const nextStopForReference = progress ? stops[progress.nextIndex]?.stop : null;
  const nextStopPois = useNearbyPois(nextStopForReference, isFocused && !offlineMode);
  // POIs de orientação seguem uma regra simples e previsível: são os pontos
  // encontrados em até 1 km da localização do usuário. Não limitamos a lista
  // artificialmente a 6 itens; a limpeza visual é feita no próprio marcador,
  // sem retirar informação de orientação que pode ser relevante.
  const routePois = useMemo(() => {
    if (!user) return nearbyPois;
    return nearbyPois
      .filter((poi) => distanceMeters(user, poi) <= 1000)
      .sort((a, b) => distanceMeters(user, a) - distanceMeters(user, b));
  }, [nearbyPois, user]);

  // Durante a viagem, somente as paradas intermediárias já ultrapassadas
  // deixam o mapa. Origem e destino permanecem visíveis durante toda a viagem,
  // enquanto a próxima parada e as seguintes continuam disponíveis para
  // orientação.
  const mapStops = useMemo(() => {
    if (!progress) return stops;
    const firstVisible = Math.min(Math.max(progress.nextIndex, boardingIndex), destinationIndex);
    const onward = stops.slice(firstVisible, destinationIndex + 1);
    if (firstVisible <= boardingIndex) return onward;
    return [stops[boardingIndex], ...onward];
  }, [progress, stops, boardingIndex, destinationIndex]);
  const mapBoardingIndex = progress ? 0 : (mapStops.length > 0 ? 0 : -1);
  const mapDestinationIndex = mapStops.length > 0 ? mapStops.length - 1 : -1;
  const mapCurrentStopIndex = progress
    ? Math.max(0, mapStops.findIndex((stop) => stop.stop.id === stops[progress.nextIndex]?.stop.id))
    : undefined;
  const nearbyLines = useNearbyLines(user, isFocused && !offlineMode);
  const atStopLines = nearbyLines.filter((item) => item.stop.distanceMeters <= 40);
  // Na ausência de um campo oficial de fluxo de passageiros no GTFS, usamos
  // a quantidade de linhas que atendem a parada como indicador operacional
  // de alta movimentação. O limiar é explícito para poder ser ajustado quando
  // a fonte oficial de movimentação estiver disponível.
  const HIGH_MOVEMENT_RADIUS_METERS = 200;
  const [highMovementStopId, setHighMovementStopId] = useState<string | null>(null);

  const demoHighMovementIndex = useMemo(() => {
    if (!simulationMode || !DEMO_HIGH_MOVEMENT_IN_SIMULATION || !ready) return -1;
    const intermediateStops = Math.max(1, destinationIndex - boardingIndex - 1);
    const offset = Math.max(1, Math.round(intermediateStops * 0.65));
    const candidate = boardingIndex + offset;
    return candidate < destinationIndex ? candidate : -1;
  }, [simulationMode, ready, boardingIndex, destinationIndex]);

  const nextStopAddress = useStopAddress(
    progress ? stops[progress.nextIndex]?.stop : null,
    isFocused && !offlineMode,
  );

  function formatDistance(meters: number | null): string {
    if (meters === null) return '--';
    if (meters < 1000) return t('tracking.distanceMeters', { count: Math.round(meters / 10) * 10 || Math.round(meters) });
    return t('tracking.distanceKm', { value: (meters / 1000).toFixed(1).replace('.', language === 'en' ? '.' : ',') });
  }

  // A tela controla o ciclo de vida do áudio: ao sair da viagem, nenhum
  // anúncio pode continuar sendo reproduzido em outra tela.
  useEffect(() => () => {
    speechService.stop();
  }, []);

  // Anuncia cada próxima parada assim que ela se torna a próxima parada.
  // O anúncio automático não fica esperando uma fala anterior terminar: se a
  // próxima parada mudou, a orientação antiga é interrompida e a nova é tocada
  // imediatamente. Isso evita que o áudio fique várias paradas atrasado.
  useEffect(() => {
    if (!progress || progress.toNext === null) return;
    if (offRouteDialogVisible || highMovementDialogVisible) return;
    if (lastSpokenStopRef.current === progress.nextStopId) return;

    const message = t('tracking.spokenNext', {
      name: progress.nextName,
      distance: formatDistance(progress.toNext),
      remaining: progress.remaining,
    });
    queueTripSpeech(message);
    lastSpokenStopRef.current = progress.nextStopId;
  }, [progress?.nextStopId, progress?.nextName, progress?.toNext, progress?.remaining, language, settings.speechRate, offRouteDialogVisible, highMovementDialogVisible, queueTripSpeech, t]);

  // Atualiza a presença do usuário durante a viagem. O endpoint de movimento
  // também registra a posição atual; aqui só precisamos manter a sessão ativa
  // quando ainda não estamos dentro do raio de uma parada.
  useEffect(() => {
    if (!simulationRunning || !isFocused || offlineMode || DEMO_HIGH_MOVEMENT_IN_SIMULATION) return;
    const interval = setInterval(() => {
      const currentUser = userRef.current;
      if (!currentUser) return;
      const currentNextStop = progress ? stops[progress.nextIndex]?.stop : null;
      if (!currentNextStop) return;
      void movementService.checkNearStop(currentUser, currentNextStop, HIGH_MOVEMENT_RADIUS_METERS).catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  }, [simulationRunning, isFocused, offlineMode, progress?.nextIndex, stops]);

  // US13: alta movimentação é estimada pela concentração de usuários ativos
  // do próprio GuiaMobi em torno da próxima parada. O backend devolve somente
  // a contagem agregada, nunca a posição ou a identidade dos demais usuários.
  const shouldCheckMovement = Boolean(
    !DEMO_HIGH_MOVEMENT_IN_SIMULATION &&
    progress &&
    progress.nextIndex < destinationIndex &&
    progress.toNext !== null &&
    progress.toNext <= HIGH_MOVEMENT_RADIUS_METERS,
  );

  // No modo de apresentação, a movimentação da parada é simulada localmente.
  // O alerta continua respeitando a mesma distância de 200 m usada pela regra.
  useEffect(() => {
    if (!DEMO_HIGH_MOVEMENT_IN_SIMULATION || !simulationRunning || !progress) return;
    if (demoHighMovementIndex < 0 || progress.nextIndex !== demoHighMovementIndex) return;
    const stopCount = Math.max(1, destinationIndex - boardingIndex);
    const targetProgress = (demoHighMovementIndex - boardingIndex) / stopCount;
    const triggerProgress = Math.max(DEMO_HIGH_MOVEMENT_MIN_PROGRESS, targetProgress - 0.12);
    if (simulationProgress < triggerProgress) return;
    if (progress.toNext === null || progress.toNext > HIGH_MOVEMENT_RADIUS_METERS) return;

    const demoStop = stops[demoHighMovementIndex]?.stop;
    if (!demoStop) return;
    if (lastHighMovementAlertRef.current === demoStop.id) return;

    setHighMovementStopId(demoStop.id);
  }, [simulationRunning, simulationProgress, progress?.nextIndex, progress?.toNext, demoHighMovementIndex, destinationIndex, boardingIndex, stops]);

  useEffect(() => {
    if (!shouldCheckMovement || offlineMode) return;

    const nextStop = progress ? stops[progress.nextIndex]?.stop : null;
    if (!nextStop) return;

    let cancelled = false;
    const check = async () => {
      const currentUser = userRef.current;
      if (!currentUser) return;
      try {
        const result = await movementService.checkNearStop(currentUser, nextStop, HIGH_MOVEMENT_RADIUS_METERS);
        if (!cancelled && result.highMovement) setHighMovementStopId(nextStop.id);
      } catch {
        // A estimativa é complementar: falha de rede não interrompe a viagem.
      }
    };

    void check();
    const interval = setInterval(() => { void check(); }, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [shouldCheckMovement, offlineMode, progress?.nextIndex, stops]);

  // Quando a concentração é confirmada, emite o alerta adicional uma única
  // vez por parada durante a viagem.
  useEffect(() => {
    if (!progress || progress.nextIndex >= destinationIndex || !highMovementStopId) return;
    if (highMovementStopId !== stops[progress.nextIndex]?.stop.id) return;
    if (lastHighMovementAlertRef.current === highMovementStopId) return;

    const nextStop = stops[progress.nextIndex].stop;
    lastHighMovementAlertRef.current = highMovementStopId;
    const message = t('tracking.highMovementStop', { name: nextStop.name });
    // A fala de alta movimentação entra na fila para não cortar a orientação
    // da próxima parada que já estiver sendo reproduzida.
    queueTripSpeech(message);
    if (settings.feedbackMode === 'voz_vibracao' || settings.feedbackMode === 'vibracao') {
      hapticsService.highMovement();
    }
    setHighMovementDialogVisible(true);
  }, [progress?.nextIndex, destinationIndex, stops, highMovementStopId, queueTripSpeech, settings.feedbackMode, t]);

  useEffect(() => {
    if (!simulationRunning || !progress) return;
    const elapsed = simulationElapsedRef.current;
    const interval = Math.floor(elapsed / 180000);
    if (interval > 0 && interval > lastPeriodicAnnouncementRef.current) {
      lastPeriodicAnnouncementRef.current = interval;
      const message = t('tracking.spokenProgress', {
        name: progress.nextName,
        remaining: progress.remaining,
      });
      queueTripSpeech(message);
    }
  }, [simulationRunning, simulationProgress, progress?.nextName, progress?.remaining, queueTripSpeech, t]);

  // Alerta a ~200 m e chegada a ~40 m do destino
  useEffect(() => {
    if (!progress || progress.toDestination === null || !line) return;
    const destName = stops[destinationIndex].stop.name;

    // O aviso precisa acontecer antes da chegada. Se uma atualização do GPS
    // atravessar os dois limiares, o Prepare-se continua tendo prioridade.
    if (progress.toDestination <= ALERT_DISTANCE_METERS && !alertedRef.current) {
      alertedRef.current = true;
      navigation.navigate('StopAlert', { stopName: destName });
      return;
    }

    if (progress.toDestination <= ARRIVAL_DISTANCE_METERS && alertedRef.current && !arrivedRef.current) {
      arrivedRef.current = true;
      speechService.stop();
      navigation.replace('Arrival', {
        placeName: p.destinationLabel ?? destName,
        trip: {
          lineCode: p.lineCode,
          lineName: p.lineName,
          destinationLabel: destName,
          durationMinutes: Math.max(1, Math.round(simulationElapsedRef.current / 60000)),
          stopsCount: Math.max(destinationIndex - boardingIndex, 0),
          startedAt,
        },
      });
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.toDestination]);

  function repeat() {
    if (!progress) return;
    const message = t('tracking.spokenNext', { name: progress.nextName, distance: formatDistance(progress.toNext), remaining: progress.remaining });
    // Repetir é uma ação explícita do usuário: usa o áudio já pré-carregado
    // quando disponível, evitando uma nova síntese de rede antes de responder.
    speechService.speakCached(message, language, settings.speechRate);
    if (settings.feedbackMode === 'voz_vibracao' || settings.feedbackMode === 'vibracao') {
      hapticsService.light();
    }
  }

  function continueAfterOffRoute() {
    speechService.stop();
    setOffRouteDialogVisible(false);
  }

  function restartRouteFromCurrentLocation() {
    const current = userRef.current;
    const destination = stops[destinationIndex]?.stop;
    if (!current || !destination) {
      setOffRouteDialogVisible(false);
      announce(t('tracking.rerouteUnavailable'), { haptic: 'warning' });
      return;
    }

    speechService.stop();
    setOffRouteDialogVisible(false);
    setSimulationRunning(false);
    navigation.navigate('RoutesFound', {
      origin: {
        label: t('tracking.currentLocation'),
        latitude: current.latitude,
        longitude: current.longitude,
      },
      destination: {
        label: p.destinationLabel ?? destination.name,
        latitude: p.destinationLatitude ?? destination.latitude,
        longitude: p.destinationLongitude ?? destination.longitude,
      },
      reroute: true,
    });
  }

  function cancelTrip() {
    speechService.stop();
    setCancelDialogVisible(true);
  }

  const destinationName = ready ? stops[destinationIndex].stop.name : p.destinationLabel ?? '';
  const minutesToNext =
    progress && progress.toNext !== null ? Math.max(1, Math.round(progress.toNext / AVERAGE_BUS_METERS_PER_MINUTE)) : null;

  return (
    <ScreenContainer
      padding={0}
      header={
        <View style={[styles.header, { backgroundColor: c.primaryDark, paddingTop: insets.top + 12 }]}>
          <View style={[styles.liveDot, { backgroundColor: c.successStrong }]} accessible={false} importantForAccessibility="no-hide-descendants" />
          <AccessibleText variant="caption" weight="extrabold" color={c.onPrimary} accessibilityRole="header">
            {t('tracking.title', { code: p.lineCode })}
          </AccessibleText>
        </View>
      }
    >
      <View style={styles.root}>
        {isLoading ? <AccessibleText style={styles.pad}>{t('tracking.locating')}</AccessibleText> : null}

        {ready ? (
          <View style={styles.mapArea}>
            <RouteMap
              stops={mapStops.map((s) => s.stop)}
              shape={simulationRunning ? simulationPath : (line?.shape ?? p.shape)}
              traveledShape={traveledPath}
              vehicles={vehicles.map((v) => ({ id: v.gtfsVehicleId, latitude: v.latitude, longitude: v.longitude }))}
              lineCode={p.lineCode}
              boardingIndex={mapBoardingIndex}
              destinationIndex={mapDestinationIndex}
              currentStopIndex={mapCurrentStopIndex}
              currentStopAddress={nextStopAddress}
              pois={routePois}
              favorites={nearbyFavorites}
              user={user}
              offlineRegionKey={
                p.originLatitude != null &&
                p.originLongitude != null &&
                p.destinationLatitude != null &&
                p.destinationLongitude != null
                  ? offlineMapService.makeRegionKey(
                      p.originLatitude,
                      p.originLongitude,
                      p.destinationLatitude,
                      p.destinationLongitude,
                    )
                  : null
              }
              height={undefined}
              badge={simulationRunning ? t('tracking.simulationBadge') : t('tracking.gps')}
              accessibilityLabel={t('tracking.mapLabel', { code: p.lineCode })}
              showIntermediateStops
            />
          </View>
        ) : null}

        {ready ? (
          <RouteBottomSheet title={t('tracking.sheetTitle')} initialHeight={250} collapsedHeight={82}>
            <View style={[styles.tabBar, { borderBottomColor: c.border }]} accessibilityRole="tablist">
              <Pressable
                onPress={() => setActivePanel('tracking')}
                accessibilityRole="tab"
                accessibilityState={{ selected: activePanel === 'tracking' }}
                accessibilityLabel={t('tracking.tabTracking')}
                style={[styles.tabButton, activePanel === 'tracking' ? { borderBottomColor: c.primary } : null]}
              >
                <AccessibleText variant="label" weight="extrabold" color={activePanel === 'tracking' ? c.primary : c.textSecondary}>
                  {t('tracking.tabTracking')}
                </AccessibleText>
              </Pressable>
              <Pressable
                onPress={() => setActivePanel('route')}
                accessibilityRole="tab"
                accessibilityState={{ selected: activePanel === 'route' }}
                accessibilityLabel={t('tracking.tabRoute')}
                style={[styles.tabButton, activePanel === 'route' ? { borderBottomColor: c.primary } : null]}
              >
                <AccessibleText variant="label" weight="extrabold" color={activePanel === 'route' ? c.primary : c.textSecondary}>
                  {t('tracking.tabRoute')}
                </AccessibleText>
              </Pressable>
              <Pressable
                onPress={() => setActivePanel('options')}
                accessibilityRole="tab"
                accessibilityState={{ selected: activePanel === 'options' }}
                accessibilityLabel={t('tracking.tabOptions')}
                style={[styles.tabButton, activePanel === 'options' ? { borderBottomColor: c.primary } : null]}
              >
                <AccessibleText variant="label" weight="extrabold" color={activePanel === 'options' ? c.primary : c.textSecondary}>
                  {t('tracking.tabOptions')}
                </AccessibleText>
              </Pressable>
            </View>

            <ScrollView
              style={styles.sheetScroll}
              showsVerticalScrollIndicator
              persistentScrollbar
              contentContainerStyle={styles.sheetContent}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              {errorMessage ? <InlineMessage message={errorMessage} tone="error" /> : null}
              {permissionDenied ? <InlineMessage message={t('tracking.permissionNeeded')} tone="warning" /> : null}
              {!permissionDenied && !user ? <InlineMessage message={t('tracking.locating')} tone="info" /> : null}

              {activePanel === 'tracking' ? (
                <>
                  {progress ? (
                    <>
                      <Card backgroundColor={c.primarySoft} borderColor={c.primary} style={styles.currentStopCard} accessible accessibilityLiveRegion="polite" accessibilityLabel={`${t('tracking.nextStop')}: ${progress.nextName}, ${formatDistance(progress.toNext)}, ${minutesToNext ? t('tracking.mins', { count: minutesToNext }) : ''}`}>
                        <AccessibleText variant="label" color={c.primary} weight="extrabold" style={styles.eyebrow}>
                          {t('tracking.nextStop')}
                        </AccessibleText>
                        <AccessibleText variant="subtitle" color={c.text} weight="extrabold" style={styles.nextName}>
                          {progress.nextName}
                        </AccessibleText>
                        <View style={styles.metaRow}>
                          <View style={styles.meta}>
                            <Icon icon={MapPin} size={16} color={c.textSecondary} />
                            <AccessibleText variant="caption" color={c.textSecondary} weight="bold">{formatDistance(progress.toNext)}</AccessibleText>
                          </View>
                          {minutesToNext ? (
                            <View style={styles.meta}>
                              <Icon icon={Clock3} size={16} color={c.textSecondary} />
                              <AccessibleText variant="caption" color={c.textSecondary} weight="bold">{t('tracking.mins', { count: minutesToNext })}</AccessibleText>
                            </View>
                          ) : null}
                        </View>
                      </Card>

                      <View style={styles.statsRow}>
                        <Card backgroundColor={c.surfaceAlt} style={styles.statCell} accessible accessibilityLabel={`${t('tracking.remainingStops')}: ${progress.remaining}`}>
                          <AccessibleText variant="label" color={c.textSecondary} style={styles.statLabel}>{t('tracking.remainingStops')}</AccessibleText>
                          <AccessibleText variant="title" weight="extrabold" color={c.primary}>{progress.remaining}</AccessibleText>
                        </Card>
                        <Card backgroundColor={c.surfaceAlt} style={styles.statCell} accessible accessibilityLabel={`${t('tracking.untilDestination')}: ${formatDistance(progress.toDestination)}`}>
                          <AccessibleText variant="label" color={c.textSecondary} style={styles.statLabel}>{t('tracking.untilDestination')}</AccessibleText>
                          <AccessibleText variant="title" weight="extrabold" color={c.primary}>{formatDistance(progress.toDestination)}</AccessibleText>
                        </Card>
                      </View>
                    </>
                  ) : null}

                  <Card backgroundColor={c.successBg} borderColor={c.successSoft} style={styles.destCard} accessible accessibilityLabel={`${t('tracking.destination')}: ${destinationName}`}>
                    <View style={[styles.flagTile, { backgroundColor: c.successButton }]}><Icon icon={Flag} size={20} color="#FFFFFF" /></View>
                    <View style={styles.flex}>
                      <AccessibleText variant="label" color={c.success} style={styles.eyebrow}>{t('tracking.destination')}</AccessibleText>
                      <AccessibleText variant="subtitle" weight="extrabold" color={c.successDark}>{destinationName}</AccessibleText>
                    </View>
                  </Card>

                  <AccessibleButton
                    label={t('tracking.repeatStop')}
                    icon={Repeat}
                    onPress={repeat}
                    disabled={!progress}
                    accessibilityHint={t('tracking.repeatStopHint')}
                  />
                </>
              ) : null}

              {activePanel === 'route' ? (
                <>
                  {progress ? (
                    <Card backgroundColor={c.surface} borderColor={c.border} style={styles.timelineCard} accessible accessibilityLabel={`${t('tracking.timeline')}: ${progress.remaining} ${t('tracking.remainingStops').toLowerCase()}`} accessibilityLiveRegion="polite">
                      <AccessibleText variant="label" color={c.textSecondary} style={styles.eyebrow}>{t('tracking.timeline')}</AccessibleText>
                      <View style={styles.timeline}>
                        {stops.slice(boardingIndex, destinationIndex + 1).map((item, localIndex) => {
                          const absoluteIndex = boardingIndex + localIndex;
                          const isPassed = absoluteIndex < progress.nextIndex;
                          const isCurrent = absoluteIndex === progress.nextIndex;
                          const isDestination = absoluteIndex === destinationIndex;
                          return (
                            <View key={item.stop.id} style={styles.timelineRow} accessible accessibilityLabel={`${item.stop.name}${isCurrent ? `, ${t('tracking.nextStop')}` : isPassed ? `, ${t('tracking.passedStop')}` : ''}`}>
                              <View style={styles.timelineRail}>
                                <View style={[styles.timelineDot, { backgroundColor: isCurrent ? c.primary : isPassed ? c.primarySoft : c.surface, borderColor: isCurrent || isPassed ? c.primary : c.border }]} />
                                {!isDestination ? <View style={[styles.timelineLine, { backgroundColor: isPassed ? c.primary : c.border }]} /> : null}
                              </View>
                              <View style={styles.timelineContent}>
                                <AccessibleText variant={isCurrent ? 'subtitle' : 'caption'} weight={isCurrent ? 'extrabold' : 'bold'} color={isCurrent ? c.primary : c.textSecondary}>{item.stop.name}</AccessibleText>
                                {isCurrent ? (
                                  <View style={styles.metaRow}>
                                    <View style={styles.meta}><Icon icon={MapPin} size={14} color={c.textSecondary} /><AccessibleText variant="caption" weight="bold" color={c.textSecondary}>{formatDistance(progress.toNext)}</AccessibleText></View>
                                    {minutesToNext ? <View style={styles.meta}><Icon icon={Clock3} size={14} color={c.textSecondary} /><AccessibleText variant="caption" weight="bold" color={c.textSecondary}>{t('tracking.mins', { count: minutesToNext })}</AccessibleText></View> : null}
                                  </View>
                                ) : null}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                      {nextStopAddress ? <AccessibleText variant="caption" color={c.textSecondary} style={styles.referenceText}>{nextStopAddress}</AccessibleText> : null}
                      {nextStopPois.length > 0 ? <AccessibleText variant="caption" color={c.textSecondary} style={styles.referenceText}>{t('tracking.nearbyReference', { name: nextStopPois[0].name ?? nextStopPois[0].category })}</AccessibleText> : null}
                    </Card>
                  ) : null}

                  {atStopLines.length > 0 ? (
                    <Card backgroundColor={c.surface} borderColor={c.border} style={styles.timelineCard} accessible accessibilityLiveRegion="polite" accessibilityLabel={t('tracking.nearbyLinesLabel', { stop: atStopLines[0].stop.name })}>
                      <AccessibleText variant="label" color={c.textSecondary} weight="bold">{t('tracking.atStopTitle')}</AccessibleText>
                      <AccessibleText variant="caption" color={c.textSecondary} style={styles.referenceText}>{t('tracking.atStopBody')}</AccessibleText>
                      <ScrollView
                        style={styles.nearbyLinesScroll}
                        contentContainerStyle={styles.nearbyLinesWrap}
                        nestedScrollEnabled
                        showsVerticalScrollIndicator
                        persistentScrollbar
                      >
                        {atStopLines.slice(0, 5).map((item) => (
                          <AccessibleButton
                            key={`${item.lineId}-${item.stop.id}`}
                            label={`${item.lineCode} — ${item.lineName}`}
                            variant="secondary"
                            style={styles.nearbyLineButton}
                            onPress={() => navigation.navigate('RouteDetail', { lineId: item.lineId, lineCode: item.lineCode, lineName: item.lineName, destinationLabel: item.stop.name })}
                          />
                        ))}
                      </ScrollView>
                    </Card>
                  ) : null}
                </>
              ) : null}

              {activePanel === 'options' ? (
                <>
                  <AccessibleText variant="label" weight="extrabold" color={c.textSecondary} style={styles.optionsHeading}>
                    {t('tracking.optionsTitle')}
                  </AccessibleText>
                  <AccessibleButton
                    label={t('tracking.help')}
                    icon={CircleHelp}
                    variant="secondary"
                    onPress={() => navigation.navigate('Help')}
                    accessibilityHint={t('tracking.helpHint')}
                  />
                  <AccessibleButton
                    label={t('tracking.cancel')}
                    icon={X}
                    variant="dangerSoft"
                    onPress={cancelTrip}
                    accessibilityHint={t('tracking.cancelHint')}
                  />
                </>
              ) : null}
            </ScrollView>
          </RouteBottomSheet>
        ) : null}
      </View>

      <AppDialog
        visible={offRouteDialogVisible}
        title={t('tracking.offRouteTitle')}
        message={t('tracking.offRouteMessage')}
        onClose={continueAfterOffRoute}
        actions={[
          { label: t('tracking.continueRoute'), variant: 'secondary', icon: X, onPress: continueAfterOffRoute },
          { label: t('tracking.restartRoute'), icon: Repeat, onPress: restartRouteFromCurrentLocation },
        ]}
      />
      <AppDialog
        visible={highMovementDialogVisible}
        title={t('tracking.highMovementTitle')}
        message={progress && progress.nextIndex < stops.length ? t('tracking.highMovementStop', { name: stops[progress.nextIndex].stop.name }) : undefined}
        onClose={() => { speechService.stop(); setHighMovementDialogVisible(false); }}
      />
      <AppDialog
        visible={cancelDialogVisible}
        title={t('tracking.cancelConfirmTitle')}
        message={t('tracking.cancelConfirmMessage')}
        onClose={() => { speechService.stop(); setCancelDialogVisible(false); }}
        actions={[
          { label: t('tracking.keepTrip'), variant: 'secondary', onPress: () => { speechService.stop(); setCancelDialogVisible(false); } },
          { label: t('tracking.cancel'), variant: 'danger', onPress: () => { speechService.stop(); setCancelDialogVisible(false); setSimulationRunning(false); navigation.goBack(); } },
        ]}
      />
    </ScreenContainer>
  );

}

const styles = StyleSheet.create({
  root: { flex: 1 },
  mapArea: { flex: 1, minHeight: 120 },
  flex: { flex: 1 },
  pad: { padding: 20, gap: 14 },
  sheetScroll: { flex: 1, minHeight: 0 },
  sheetContent: { padding: 16, gap: 14, paddingBottom: 32 },
  nearbyLinesScroll: { maxHeight: 156 },
  nearbyLineButton: { width: '100%' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 8 },
  tabButton: { flex: 1, minHeight: 50, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  currentStopCard: { padding: 16, borderWidth: 2, gap: 2 },
  optionsHeading: { marginBottom: -2 },
  suggestionCard: { padding: 14, borderWidth: 2 },
  nearbyLinesWrap: { gap: 8, marginTop: 8, paddingBottom: 4 },
  lineChip: { minWidth: 92, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10, borderWidth: 1, gap: 1 },
  referenceText: { marginTop: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 12 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  timelineCard: { padding: 16, borderWidth: 1 },
  timeline: { marginTop: 12 },
  timelineRow: { flexDirection: 'row', minHeight: 42 },
  timelineRail: { width: 24, alignItems: 'center' },
  timelineDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, marginTop: 2, zIndex: 1 },
  timelineLine: { width: 2, flex: 1, minHeight: 24 },
  timelineContent: { flex: 1, paddingLeft: 8, paddingBottom: 10 },
  eyebrow: { letterSpacing: 0.7 },
  nextName: { marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCell: { flex: 1, padding: 14, gap: 4 },
  statLabel: { letterSpacing: 0.2 },
  destCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  flagTile: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
});
