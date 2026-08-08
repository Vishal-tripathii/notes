# Docker Fundamentals — Scenario Bank

---

### "Container vs VM?"

A **VM (virtual machine)** virtualizes an entire computer, including its **own kernel** — a hypervisor emulates hardware, and each VM runs a complete, independent OS on top of it. Fully isolated, but heavy: booting a VM means booting a whole OS, and each VM duplicates OS-level resources (its own kernel, its own copy of system libraries).

A **container** virtualizes at a higher level — it shares the **host machine's kernel**, and isolation is achieved through OS-level features (Linux namespaces for isolating what a process can see — its own filesystem view, network stack, process list — and cgroups for limiting how much CPU/memory it can use), not by emulating hardware or running a separate kernel. Because there's no separate OS to boot and no kernel duplication, containers start in roughly milliseconds/seconds instead of a VM's tens of seconds to minutes, and are far lighter on memory/disk.

**Trade-off:** VMs give stronger isolation (a full separate kernel is a much larger security boundary) and can run a *different* OS than the host. Containers are lighter and faster but share the host kernel — a kernel-level vulnerability is a more direct shared risk across containers than it would be across VMs.

**Interview line:** *"A VM virtualizes a whole machine including its own kernel, via a hypervisor — fully isolated but heavy to boot. A container shares the host's kernel and isolates a process using namespaces and cgroups instead of emulating hardware, which is why it starts in seconds and is far lighter — the trade-off is that shared kernel is a smaller isolation boundary than a VM's fully separate one."*

**Tests:** virtualization fundamentals, isolation trade-offs

*Axis: normal · Source: challenge question*

---

### "What actually happens when a container starts? Image vs container? Layered filesystem?"

An **image** is a read-only template — a snapshot of a filesystem plus metadata (the command to run, environment variables, exposed ports) — built once from a `Dockerfile` and then reused. A **container** is a running (or stopped) **instance** of an image — the same relationship as a class and an object: one image, many containers can be created from it, each independent.

Images are built in **layers** — each instruction in a `Dockerfile` (`FROM`, `RUN`, `COPY`, etc.) creates a new, immutable layer stacked on the ones before it, and Docker caches layers so an unchanged instruction doesn't need to be rebuilt on the next build. When a container **starts**, Docker adds one new **writable layer** on top of the image's read-only layers (this is where any files the running container creates/modifies actually go — the underlying image layers themselves are never touched), sets up the container's isolated namespaces (its own filesystem view via the layered image, its own network interface, its own process tree) and cgroup resource limits, and then executes the image's configured entrypoint command as the container's process.

```dockerfile
FROM node:20        # layer 1 — base OS + Node runtime
COPY package.json .  # layer 2
RUN npm install       # layer 3 — cached if package.json hasn't changed
COPY . .              # layer 4
CMD ["node", "index.js"]
```

**Interview line:** *"An image is a read-only, layered template built from a Dockerfile — each instruction adds an immutable, cacheable layer. A container is a running instance of that image, with one new writable layer added on top for anything it creates or changes at runtime, plus its own isolated namespaces and cgroup limits. Starting a container means setting up that isolation and writable layer, then running the image's configured entrypoint command."*

**Tests:** image/container relationship, layered builds

*Axis: normal · Source: challenge question*

---

### "Why are Docker images large? How do you reduce image size? Multi-stage builds?"

Images grow large from accumulating unnecessary layers/content: a full base OS image (rather than a minimal one) when the app doesn't need most of it, build tools and dev dependencies that were only needed to *build* the app baked permanently into the final image, layer caching working against you (a `COPY . .` before installing dependencies invalidates the dependency-install cache on every code change, and also means every file in the repo — including things that shouldn't ship, like test fixtures or `.git` — potentially ends up in a layer), and simply not cleaning up temporary files/package manager caches within the same layer they were created in (deleting them in a *later* layer doesn't shrink the image — the earlier layer still contains them, since layers are immutable once created).

**Reduction techniques:**
- **Smaller base image** — `node:20-alpine` instead of `node:20` (a minimal Linux distribution instead of a full one).
- **Order Dockerfile instructions to maximize cache hits** — copy dependency manifests and install dependencies *before* copying the rest of the source, so code changes don't invalidate the dependency-install layer.
- **`.dockerignore`** — exclude `node_modules`, `.git`, test files, etc. from ever being sent to the build context/copied into a layer at all.
- **Multi-stage builds** — the actual highest-leverage fix: use one stage (with a full toolchain — compilers, dev dependencies) to *build* the app, then copy only the finished build output into a second, minimal final stage that never had the build tools at all.

```dockerfile
# stage 1 — has the full toolchain, only used for building
FROM node:20 AS build
COPY . .
RUN npm install && npm run build

# stage 2 — minimal final image, only the build output is copied in
FROM node:20-alpine
COPY --from=build /app/dist ./dist
CMD ["node", "dist/index.js"]
```

**Interview line:** *"Multi-stage builds are the highest-leverage fix — build in one stage with the full toolchain, then copy only the finished output into a second, minimal final image that never had the compilers or dev dependencies in it at all. On top of that, a minimal base image, a .dockerignore, and ordering the Dockerfile so dependency installation is cached separately from source code changes."*

**Tests:** image size optimization, multi-stage builds

*Axis: performance · Source: challenge question*

---

### "How do you persist database data in Docker? Volume vs bind mount?"

A container's own writable layer is **ephemeral** — it's deleted along with the container (see next question). For anything that needs to survive a container being removed and recreated — most obviously a database's actual data — you need storage that lives **outside** the container's own filesystem.

**Volumes** — storage managed by Docker itself, living in a location Docker controls on the host (outside any specific container's writable layer). The standard, recommended way to persist data — Docker handles the storage lifecycle, they're portable across different host setups, and they can be more easily backed up/managed as a unit.
**Bind mounts** — map a **specific path on the host filesystem** directly into the container. Useful in development (mounting your local source code into a container so edits show up live without rebuilding), but tie the container directly to that specific host machine's filesystem layout, which is generally not what you want in production.

```yaml
# docker-compose.yml — a volume, the recommended pattern for a database
services:
  db:
    image: postgres
    volumes:
      - db-data:/var/lib/postgresql/data  # named volume, Docker-managed
volumes:
  db-data:
```

**Interview line:** *"A container's own filesystem is ephemeral — it disappears with the container — so a database needs storage outside it. Volumes are Docker-managed storage, the recommended approach for actual persistence since Docker handles the lifecycle and they're portable. Bind mounts map a specific host path directly in, which is great for local development — mounting source code for live editing — but ties you to that specific host's filesystem layout, which I'd avoid in production."*

**Tests:** persistence patterns, volumes vs bind mounts

*Axis: recovery · Source: challenge question*

---

### "What happens when the container is deleted?"

The container's **writable layer** — everything it created or changed at runtime that wasn't in the original image — is destroyed along with it. The underlying image layers are untouched (they're shared, read-only, and other containers from the same image are unaffected), but anything the deleted container itself wrote is simply gone, permanently, unless it was written to a **volume** or **bind mount** rather than the container's own filesystem.

This is exactly why running a database *without* an explicitly mounted volume is a real, common mistake — the data appears to work fine right up until someone recreates the container (a routine deploy, `docker-compose down` + `up`, an image update) and discovers every row is gone, because it lived only in the deleted container's writable layer.

**Interview line:** *"Deleting a container destroys its writable layer — everything it created or changed at runtime — while the underlying image itself is untouched since it's shared and read-only. That's exactly why running a database without a mounted volume is a real, easy mistake: it looks fine until the container gets recreated during a routine deploy and all the data that lived only in that writable layer is just gone."*

**Tests:** container lifecycle, data loss scenarios

*Axis: failure · Source: challenge question*

---

### "How do containers communicate? Bridge network vs host network?"

By default, containers on the **same Docker network** (a "bridge" network, either the default one or a custom user-defined one) can reach each other **by container/service name** — Docker provides internal DNS resolution, so a container named `api` can reach the database container simply by connecting to hostname `db`, without needing to know its actual IP address (which can change on restart anyway).

**Bridge network** (the default mode) — each container gets its own isolated virtual network interface and IP, NAT'd through the host; ports have to be explicitly published (`-p 8080:80`) to be reachable from outside the Docker host at all. This is the default and generally right choice — good isolation, containers only expose what they explicitly publish.

**Host network** — the container shares the **host machine's** network stack directly, with no isolation and no port mapping needed (a container binding to port 80 binds directly to the host's port 80). Occasionally used for performance-sensitive networking or specific tooling needs, but sacrifices the network isolation that's normally one of the main benefits of containerizing in the first place — generally the exception, not the default.

**Interview line:** *"On the same Docker network, containers reach each other by service name through Docker's built-in DNS, without needing to track IPs directly. Bridge is the default — each container gets its own isolated network interface, and ports have to be explicitly published to be reachable from outside. Host network skips that isolation entirely and shares the host's network stack directly — I'd only reach for that in specific performance or tooling cases, since it gives up one of the main benefits of containerizing at all."*

**Tests:** container networking, bridge vs host mode

*Axis: normal · Source: challenge question*

---
