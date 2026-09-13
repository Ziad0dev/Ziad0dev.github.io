+++
date = '2026-09-13'
draft = false
title = 'My dots are a bug tracker'
tags = ['nixos', 'nix', 'hyprland', 'dotfiles']
+++

The pitch for NixOS is reproducibility. That's true, and it's not the reason I'm still here.

The reason is that every bug I hit ends up written down somewhere that actually runs. On a normal distro, fixing a driver problem means a shell command at 2am, a working system, and no memory of what you did three months later when it breaks again. Here the fix is a file. It gets committed. It gets evaluated on every rebuild. If I delete it, the machine tells me.

My config lives at [github.com/Ziad0dev/dots](https://github.com/Ziad0dev/dots). What follows is less a tour of the layout than a list of the things that bit me, because those are the parts worth anyone else's time.

## One owner per path

The first discipline that mattered has nothing to do with Nix's semantics. It's a rule I made up after breaking things repeatedly: exactly one mechanism owns each config directory.

Either a path comes from home-manager's store generation, or it's an out-of-store symlink into the repo. Never both, never half. The helper in `home/profiles/base.nix` is one line:

```nix
link = sub: config.lib.file.mkOutOfStoreSymlink "${config.dots.repoPath}/config/${sub}";
```

Editing `config/hypr/hyprland.lua` then takes effect on `hyprctl reload` with no rebuild, which is the whole point.

The rule is easy to state and easy to violate. I once switched `config/btop` from directory-owned to per-file-owned without removing the old directory symlink first. Home-manager's write followed the link into the repo and replaced `config/btop/btop.conf` with a store symlink pointing at itself. A real ELOOP, inside my own git tree, showing up as a `MT` in `git status`. `namei -l` is the tool that explains what you're looking at.

Related trap: btop silently drops any theme file that fails `access(path, R_OK)`, so a dangling symlink doesn't error, it just falls back to the built-in default and you spend twenty minutes wondering why your colours don't apply.

## The flake only sees what git sees

This one cost me hours the first time and I still nearly repeat it.

A `git+file` flake evaluates **tracked** content. Not your working tree. You edit a module, run `nh os switch`, nothing changes, and you start debugging a phantom: reading the file you just edited, confirming it says what you think, and concluding Nix is broken.

```fish
git add -A; and nh os switch
```

That's the whole fix. `git add -A` before anything that evaluates. I keep it muscle memory now.

The corollary is subtler: a switch reporting `PATHS +0, -0` is *expected* when only files under `config/` changed, since those reach `~/.config` by symlink and no store path moves. It only signals a problem when a `.nix` file was edited. And an identical closure doesn't re-run home-manager activation at all, so a path you deleted by hand stays deleted. Force it:

```fish
sudo systemctl restart home-manager-ziad0dev.service
```

There is no separate `home-manager switch` when HM runs as a NixOS module.

## The fix lives in the repo

My favourite example of why any of this is worth the tax.

I run the CachyOS kernel via chaotic-nyx with the open NVIDIA driver. For a while, whenever the driver built from source instead of hitting the cache, the build died on a reference check: the output wasn't allowed to refer to a `linux-*-dev` path. Twice, months apart, with no memory of the first round.

Root cause turned out to be mundane and very specific. The CachyOS kernel compresses modules, so they install as `.ko.zst`. Nixpkgs' `nuke-refs` pass globs `*.ko`, never matches, and the kernel dev path survives inside `nvidia-modeset.ko.zst`.

The fix is a plain function at `lib/nvidia-zstd-refs.nix` whose `postFixup` decompresses, nukes, recompresses every module. One call site:

```nix
package = fixZstdRefs pkgs.nvidia_cachyos;
```

Three things I learned that the error message doesn't tell you. The `open` derivation doesn't inherit `nukeReferences` from `nvidia-x11`, so you add `pkgs.nukeReferences` explicitly or `fixupPhase` dies with exit 127. The file must **not** live in `modules/`, because anything there is called as a NixOS module and fails with `function called with unexpected argument 'system'`. And an unchanged `drvPath` across rebuilds proves your override never reached the derivation, so check that before debugging anything downstream.

The version-pinning "fix" I rejected was downgrading the driver. That works until the next bump. The zstd override is version-independent, which is the difference between a workaround and a fix.

## Rollback has a finite buffer

The most useful thing I broke this year.

I decided to replace SDDM with a greetd greeter written in Quickshell. Reasonable idea. It locked me out twice.

The first attempt crashed instantly, with greetd logging "greeter exited without creating a session" and zero output from the compositor. The second was better and worse: `quickshell -c greeter` resolves its config *by name* across `$XDG_CONFIG_HOME` and `$XDG_CONFIG_DIRS`, my launcher had pointed `XDG_CONFIG_HOME` at a cache dir containing no such config, and `hyprctl` wasn't on the greeter's minimal PATH either. So `exec-once = sh -c "quickshell -c greeter; hyprctl dispatch exit"` left me staring at a bare Hyprland with no bar and no keybinds. Use absolute store paths and `-p`, not `-c`.

But the part that turned a bad boot into an actual lockout was this line:

```nix
boot.loader.systemd-boot.configurationLimit = 3;
```

I'd set it to 3 after filling the ESP. Three rebuilds in one session rotated the last working generation off the boot menu. The famous NixOS rollback is real, and it is exactly as deep as you configured it to be.

Recovery was the boot-entry editor, `e`, then `systemd.unit=multi-user.target`, plus `fsck.mode=skip` because the hard power-off had left a pending check. I'm on SDDM again and I don't feel bad about it.

## Theming without a git diff

The part I'm actually happy with.

A theme is one file: `config/themes/<name>/colors.sh`, 47 keys, plus a preview and usually a wallpaper. Themes are discovered by glob, so dropping in a directory makes it live with no rebuild and nothing to register. There are 46 of them now, mostly transcribed from omarchy palettes.

`themectl` renders `config/themes/_templates/*.in` through `envsubst` into `~/.local/state/dots/theme/`. Two design choices carry the whole thing:

**Render to state, never into the repo.** Switching themes twenty times produces no git diff. The repo holds templates; the state dir holds today's answer.

**envsubst with an explicit variable whitelist, not blanket substitution.** That's what lets hyprlock's own `$TIME` and dunst's format strings pass through untouched.

Then there are derived keys, because seven themes define `base03 == base04 == base05` and you need *something* for a muted surface colour. `themectl` blends foreground toward background to compute `${dim}`, `${muted}`, `${surface}`. It also exports a hash-stripped `${x_hex}` form, because Hyprland wants `rgb(1e2327)` and everyone else wants `#1e2327`.

What doesn't reload cleanly is worth knowing up front. swayosd reads its CSS once at server start, so a theme switch has to `systemctl --user try-restart swayosd.service`. btop has no reload or IPC at all: it builds its theme list and calls `setTheme()` exactly once, so you quit and reopen it. Dolphin ignores all of this because it's a KDE app reading KDE colourschemes, which is one of several reasons I moved to yazi.

## Declarative is not the same as correct

Three failures that were all *valid Nix*, evaluated fine, and did nothing.

**Rootless docker.** I pulled `docker` out of `extraGroups`, since group membership is passwordless root, and enabled the rootless daemon. `setSocketVariable = true` exports `DOCKER_HOST` through `environment.extraInit`, which writes to `/etc/profile`, which **fish never reads**. Silently no-op. The fix is a `home.sessionVariables` entry pointing at `unix:///run/user/1001/docker.sock`.

**Flatpak.** During a refactor I removed `services.flatpak.enable` from `configuration.nix` and from `foreign.nix`, and added the new `flatpak.nix` to no module list. Three candidate owners, zero actual ones.

**SDDM.** My custom greeter theme loaded its `theme.conf` successfully, logged so, and then fell back to the embedded KDE theme. SDDM 0.21 picks which greeter *binary* to launch from a `QtVersion` key in `metadata.desktop` and defaults to Qt5 when absent. The nixpkgs build is Qt6-only. One missing line. Worth noting that `sddm-greeter-qt6 --test-mode` could never have caught it, because invoking the binary by hand bypasses the exact selection step that was broken.

The through-line: evaluation success proves your expression is well-formed. It says nothing about whether the resulting system does what you meant.

## Making it portable

The repo started hardcoded to one hostname and one home directory. It now builds `nixosConfigurations`, `darwinConfigurations` and `homeConfigurations` from `lib/mk.nix`, with a `dots.repoPath` option replacing every `/home/ziad0dev/dots` string.

The bug that exercise surfaced is my favourite kind. `lib/mk.nix` was missing an overlay that `hosts/nixos/configuration.nix` had, so the bare home-manager config could never evaluate. Nobody noticed for weeks because the pre-commit hook evaluated only `nixosConfigurations.nixos`. The hook now loops every host and every home config. A check that covers one path gives you exactly one path's worth of confidence.

## What I'd actually tell you

Commit before you evaluate. Decide who owns each path and write the rule down. Put the fix in the repo rather than in your shell history. Raise `configurationLimit` past the number of rebuilds you're willing to do in one sitting before you touch the display manager.

And accept that the `.nix` file is the easy part. The hard part is always the thing underneath: a kernel that compresses modules, a shell that doesn't read `/etc/profile`, a greeter that picks its binary from a desktop file. Nix gives you somewhere durable to put that knowledge. It doesn't find it for you.
