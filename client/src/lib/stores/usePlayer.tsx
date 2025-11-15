import { create } from "zustand";
import * as THREE from "three";

interface PlayerState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;          // <-- velocity added
  speed: number;
  attack: number;
  attackRange: number;
  health: number;
  maxHealth: number;                // <-- maxHealth added
  defense: number;
  canAttack: boolean;
  setCanAttack: (val: boolean) => void;
  move: (delta: THREE.Vector3) => void;
  takeDamage: (amount: number) => void;
  reset: () => void;
}

export const usePlayer = create<PlayerState>((set) => ({
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),    // initialize velocity
  speed: 15,
  attack: 40,
  attackRange: 7,
  health: 100,
  maxHealth: 100,                   // initialize maxHealth
  defense: 0,
  canAttack: true,
  setCanAttack: (val) => set({ canAttack: val }),

  move: (delta) => set((state) => ({
    position: state.position.clone().add(delta)
  })),

  takeDamage: (amount) => set((state) => ({
    health: Math.max(state.health - amount, 0)
  })),

  reset: () => set({
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    health: 100,
    maxHealth: 100,
    canAttack: true,
  })
}));
