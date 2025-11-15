import { create } from "zustand";
import * as THREE from "three";

export interface Projectile {
  id: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  damage: number;
  speed: number;
  maxRange: number;
  distanceTraveled: number;
  
  // Visual properties
  color: string;
  size: number;
  trailColor: string;
  
  // Special properties
  homing: boolean;
  piercing: number;
  piercedEnemies: Set<string>;
  bouncing: number;
  bouncesLeft: number;
  explosive?: { radius: number; damage: number };
  chainLightning?: { chains: number; range: number; chainedEnemies: Set<string> };
  
  // Slot reference
  slotId: number;
}

interface ProjectilesState {
  projectiles: Projectile[];
  
  // Actions
  addProjectile: (config: {
    position: THREE.Vector3;
    direction: THREE.Vector3;
    slotId: number;
    damage: number;
    speed: number;
    range: number;
    homing: boolean;
    piercing: number;
    bouncing: number;
    explosive?: { radius: number; damage: number };
    chainLightning?: { chains: number; range: number };
  }) => void;
  
  updateProjectiles: (
    delta: number, 
    enemies: Array<{ id: string; position: THREE.Vector3; health: number; velocity?: THREE.Vector3 }>, 
    playerPos: THREE.Vector3,
    roomBounds: number,
    onHit: (enemyId: string, damage: number, knockback: THREE.Vector3) => void
  ) => void;
  
  removeProjectile: (id: string) => void;
  reset: () => void;
}

export const useProjectiles = create<ProjectilesState>((set, get) => ({
  projectiles: [],
  
  addProjectile: (config) => {
    const projectile: Projectile = {
      id: Math.random().toString(36).substring(2, 11),
      position: config.position.clone(),
      velocity: config.direction.clone().normalize().multiplyScalar(config.speed),
      damage: config.damage,
      speed: config.speed,
      maxRange: config.range,
      distanceTraveled: 0,
      color: getProjectileColor(config),
      size: 0.5,
      trailColor: getTrailColor(config),
      homing: config.homing,
      piercing: config.piercing,
      piercedEnemies: new Set(),
      bouncing: config.bouncing,
      bouncesLeft: config.bouncing,
      explosive: config.explosive,
      chainLightning: config.chainLightning ? {
        ...config.chainLightning,
        chainedEnemies: new Set()
      } : undefined,
      slotId: config.slotId,
    };
    
    set((state) => ({
      projectiles: [...state.projectiles, projectile]
    }));
  },
  
  updateProjectiles: (delta, enemies, playerPos, roomBounds, onHit) => {
    const projectiles = get().projectiles;
    const updatedProjectiles: Projectile[] = [];
    
    for (const proj of projectiles) {
      // Homing behavior
      if (proj.homing && enemies.length > 0) {
        const nearestEnemy = enemies.reduce<{ enemy: typeof enemies[0] | null; dist: number }>((nearest, enemy) => {
          if (proj.piercedEnemies.has(enemy.id)) return nearest;
          const dist = proj.position.distanceTo(enemy.position);
          return dist < nearest.dist ? { enemy, dist } : nearest;
        }, { enemy: null, dist: Infinity });
        
        if (nearestEnemy.enemy && nearestEnemy.dist < 15) {
          const toEnemy = nearestEnemy.enemy.position.clone()
            .sub(proj.position)
            .normalize();
          
          // Smoothly turn towards enemy
          const turnSpeed = 5 * delta;
          proj.velocity.lerp(toEnemy.multiplyScalar(proj.speed), turnSpeed);
          proj.velocity.normalize().multiplyScalar(proj.speed);
        }
      }
      
      // Move projectile
      const movement = proj.velocity.clone().multiplyScalar(delta);
      proj.position.add(movement);
      proj.distanceTraveled += movement.length();
      
      // Check range
      if (proj.distanceTraveled > proj.maxRange) {
        continue; // Remove
      }
      
      // Check wall collision for bouncing
      let bounced = false;
      if (proj.bouncesLeft > 0) {
        if (Math.abs(proj.position.x) > roomBounds) {
          proj.velocity.x *= -1;
          proj.position.x = Math.sign(proj.position.x) * roomBounds;
          proj.bouncesLeft--;
          bounced = true;
        }
        if (Math.abs(proj.position.z) > roomBounds) {
          proj.velocity.z *= -1;
          proj.position.z = Math.sign(proj.position.z) * roomBounds;
          proj.bouncesLeft--;
          bounced = true;
        }
      } else if (Math.abs(proj.position.x) > roomBounds || Math.abs(proj.position.z) > roomBounds) {
        continue; // Remove
      }
      
      // Check enemy collision
      let hitEnemy = false;
      for (const enemy of enemies) {
        if (proj.piercedEnemies.has(enemy.id)) continue;
        
        const dist = proj.position.distanceTo(enemy.position);
        if (dist < 1.0) {
          // Hit!
          const knockbackDir = proj.velocity.clone().normalize();
          onHit(enemy.id, proj.damage, knockbackDir.multiplyScalar(8));
          
          // Chain lightning effect
          if (proj.chainLightning && proj.chainLightning.chainedEnemies.size < proj.chainLightning.chains) {
            proj.chainLightning.chainedEnemies.add(enemy.id);
            
            // Find nearby enemies to chain to
            const nearbyEnemies = enemies.filter(e => 
              e.id !== enemy.id &&
              !proj.chainLightning!.chainedEnemies.has(e.id) &&
              e.position.distanceTo(enemy.position) < proj.chainLightning!.range
            );
            
            if (nearbyEnemies.length > 0) {
              const chainTarget = nearbyEnemies[0];
              onHit(chainTarget.id, proj.damage * 0.7, new THREE.Vector3());
              proj.chainLightning.chainedEnemies.add(chainTarget.id);
            }
          }
          
          // Explosive effect
          if (proj.explosive) {
            enemies.forEach(e => {
              const explosionDist = e.position.distanceTo(proj.position);
              if (explosionDist < proj.explosive!.radius) {
                const explosionDir = e.position.clone().sub(proj.position).normalize();
                onHit(e.id, proj.explosive!.damage, explosionDir.multiplyScalar(12));
              }
            });
          }
          
          hitEnemy = true;
          proj.piercedEnemies.add(enemy.id);
          
          // Check if piercing allows continuation
          if (proj.piercedEnemies.size > proj.piercing) {
            break;
          }
        }
      }
      
      // Remove if hit and can't pierce more
      if (hitEnemy && proj.piercedEnemies.size > proj.piercing) {
        continue;
      }
      
      updatedProjectiles.push(proj);
    }
    
    set({ projectiles: updatedProjectiles });
  },
  
  removeProjectile: (id) => set((state) => ({
    projectiles: state.projectiles.filter(p => p.id !== id)
  })),
  
  reset: () => set({ projectiles: [] }),
}));

// Helper functions for visual appearance
function getProjectileColor(config: any): string {
  if (config.explosive) return "#ff6600";
  if (config.chainLightning) return "#00ffff";
  if (config.homing) return "#ff00ff";
  if (config.piercing > 0) return "#ffff00";
  if (config.bouncing > 0) return "#00ff00";
  return "#ffffff";
}

function getTrailColor(config: any): string {
  if (config.explosive) return "rgba(255, 102, 0, 0.5)";
  if (config.chainLightning) return "rgba(0, 255, 255, 0.5)";
  if (config.homing) return "rgba(255, 0, 255, 0.5)";
  if (config.piercing > 0) return "rgba(255, 255, 0, 0.5)";
  if (config.bouncing > 0) return "rgba(0, 255, 0, 0.5)";
  return "rgba(255, 255, 255, 0.5)";
}