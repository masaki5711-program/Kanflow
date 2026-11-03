---
name: pytorch-patterns
description: PyTorch discipline for this repo's AI & Data Science service — reproducibility, device-agnostic code, training-loop and DataLoader decisions, checkpointing, GPU memory strategy. Use when: writing or reviewing model architectures, training/eval loops, Dataset/DataLoader code, or optimizing training memory/speed. Do not use when: fixing a concrete CUDA/build/shape crash (pytorch-build-resolver agent), generic Python style (python-patterns), test design (python-testing), or LLM inference via Ollama (claude-api skill covers orchestration design).
origin: ECC
---

# PyTorch Patterns

Constraints and decision tables only. API syntax is assumed known.

## Related (read first)

- `pytorch-build-resolver` agent — owns fixing runtime/CUDA/shape errors; this skill owns preventing them by design.
- `python-patterns` — general Python constraints (timeouts, no silent failures, TZ-aware timestamps) still apply to training scripts.
- CLAUDE.md §2 — training data is manufacturing data: it stays on-prem; never upload datasets, checkpoints, or metrics to external services.

## Non-negotiables (each violation is a review blocker)

- Device-agnostic: resolve the device once, `.to(device)` everywhere; never hardcode `.cuda()`.
- Reproducible: seed torch, CUDA, numpy, and random together; record the seed with the run; set cudnn deterministic when comparing experiments.
- Mode discipline: `model.train()` before training, `model.eval()` + no-grad for evaluation — eval without `eval()` silently corrupts dropout/BatchNorm behavior.
- Shapes documented: annotate expected tensor shapes at each stage of `forward`; shape intent must be readable without running the code.
- Checkpoints save full training state (model + optimizer + epoch + metric), via `state_dict` — never pickle the whole model object; load with `weights_only=True`.
- No layer/weight creation inside `forward`; all parameters registered in `__init__`.

## Decision table

| Situation | Choice |
|---|---|
| Gradient clearing | `zero_grad(set_to_none=True)` |
| GPU memory tight, model fits | mixed precision (autocast + GradScaler), gradient clipping stays outside the scaled region |
| GPU memory tight, activations dominate | gradient checkpointing (`use_reentrant=False`) |
| Training too slow, PyTorch ≥ 2.0 | `torch.compile` after correctness is proven, not before |
| DataLoader defaults | workers > 0, `pin_memory` on GPU, `persistent_workers`, `drop_last` when BatchNorm present |
| Variable-length sequences | custom `collate_fn` with padding — not per-sample padding in the Dataset |
| Loss value for logging | `.item()` after `backward()`, never before |
| Residual/in-place ops | out-of-place; in-place ops on autograd-tracked tensors are a correctness risk |
| Profiling before optimizing | `torch.profiler` + `torch.cuda.memory_summary()` — measure, do not guess |

## Anti-patterns (one line each)

- Moving the model to device inside the batch loop.
- Accumulating raw loss tensors across an epoch (keeps graphs alive; accumulate `.item()`).
- Evaluating with batch statistics because `eval()` was forgotten.
- Non-deterministic runs presented as experiment comparisons.
- Saving only model weights when the intent is to resume training.

## Completion checklist

- [ ] Runs on CPU-only machine (even if slowly) — no hard CUDA dependency.
- [ ] Seed captured and logged with every run.
- [ ] Eval path uses `eval()` + no-grad; train/eval metrics not mixed.
- [ ] Checkpoint round-trip (save → load → resume) actually tested.
- [ ] DataLoader tuned; no `num_workers=0` default left in production paths.
- [ ] No dataset, checkpoint, or metric egress off-prem.
