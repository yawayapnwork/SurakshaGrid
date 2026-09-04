import { useEffect, useRef, useState } from 'react';

interface WebSocketMessage {
  event: string;
  data: Record<string, unknown>;
}

interface UseWebSocketOptions {
  url?: string;
  onMessage?: (message: WebSocketMessage) => void;
  enabled?: boolean;
}

export function useWebSocket({
  url = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws',
  onMessage,
  enabled = true,
}: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let reconnectTimer: NodeJS.Timeout;

    const connect = () => {
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data: WebSocketMessage = JSON.parse(event.data);
            if (onMessage) {
              onMessage(data);
            }
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          // Try reconnecting after 3 seconds
          reconnectTimer = setTimeout(() => {
            connect();
          }, 3000);
        };

        ws.onerror = (err) => {
          console.warn('WebSocket error:', err);
          ws.close();
        };
      } catch (err) {
        console.error('WebSocket connection error:', err);
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [url, enabled, onMessage]);

  return { isConnected: enabled && isConnected };
}
