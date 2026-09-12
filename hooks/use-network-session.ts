'use client';
import { useSyncExternalStore } from 'react';
import { EMPTY_SESSION, networkSnapshot, subscribeNetwork } from '@/lib/game/network/session';
export function useNetworkSession(){return useSyncExternalStore(subscribeNetwork,networkSnapshot,()=>EMPTY_SESSION);}
