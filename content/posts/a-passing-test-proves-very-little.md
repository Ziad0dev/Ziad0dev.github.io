+++
date = '2026-11-10'
draft = false
title = 'A passing test proves very little'
tags = ['zig', 'tinygrad', 'compilers', 'machine-learning', 'testing']
+++

I've been building a course called [zigrad](https://github.com/Ziad0dev/zigrad). It teaches [tinygrad](https://github.com/tinygrad/tinygrad), deep learning and the maths under both by having you rebuild all of it in Zig, one small broken program at a time. The format is stolen from [ziglings](https://codeberg.org/ziglings/exercises): each file explains one idea in its comments, leaves a hole, and has tests at the bottom that pass once you fill it.

```zig
    // 3. divide by the total, so everything adds up to 1
    for (out) |*o| {
        o.* ???;
    }
```

There are 208 of these now, in six parts. They start at "a tensor is numbers in a row" and end with a tensor graph going through a scheduler and coming out as CUDA kernels on my GPU.

I should say up front that I didn't type most of it. The exercises were written with Claude Code, with me steering, reading and breaking things. That is exactly why this post is about testing and not about tensors. When you didn't write every line yourself, "it looks right" is worth nothing, and the only thing you can lean on is the checks. So the interesting question became: how do you check a *course*?

## What the obvious checks miss

The obvious check for an exercise has two halves. The file as shipped must fail, and the reference solution must pass. `tools/verify.sh` does that for every exercise, and for a while I thought that was enough.

It isn't, because of what a learner actually does. A learner doesn't type the reference solution. They type something *near* it, and what they need to know is whether near is right. A test suite that accepts the reference answer and also accepts three wrong ones teaches the wrong ones to whoever happens to write them.

So the course is mutation-tested. `tools/mutate.py` takes each hole's answer, makes one small mistake in it (a flipped operator, a constant off by one, swapped arguments, a dropped line), and runs the tests. They are supposed to fail. If they pass, either the tests have a gap or the mistake wasn't one.

The first run found gaps in exercises I would have sworn were fine:

- The index simplifier's tests never tried a negative `x`, so rewriting `x % 8` and `x // 8` when you shouldn't went unnoticed.
- The bounds of a product of two ranges were only tested on ranges with the same sign.
- BPE never met a pair at the very end of the input.
- A handful of exercises had ties (which element gets max-pool's gradient, when to store versus recompute) that the tests left open, so two learners could both pass with different behaviour.

None of these were bugs in the solutions. Every solution was correct. The tests just couldn't tell correct from almost.

## Some mistakes aren't mistakes

The survivors that aren't gaps are the fun ones. The tool flagged this as a wrong answer for a variance:

```zig
(x + mean) * (x - mean)
```

where the reference is `(x - mean)` squared. It passes every test, and it should: averaged over a batch whose mean is `mean`, the two give the same number. Those go in `tools/mutants_ok.txt`, one line each, with the reason written next to them. There are 51.

An allowlist is itself a thing that rots, so there's a check on the check: every entry has to match a mutant of exactly one hole. A stale entry fails CI, and an entry can't quietly excuse a survivor somewhere else in the file.

## What the tools couldn't see

Mutation testing got me to trust the tests. It did nothing about a class of problem that only showed up when I read the exercises as a learner would.

**Answers in plain sight.** Part V's exercises build on each other, so a later one can include an earlier one's finished code. Exercise 188 included an export from 189, which pasted 189's answers into the file you read first. One header comment stated the exact formula its hole asked for. One visible test contained the answer verbatim. Everything compiled, everything failed and passed as it should. The generator now refuses an include that points forward, and eleven older headers were reworded to describe the idea and leave the last step to you.

**A test that punished the right answer.** Exercise 012 teaches that broadcasting takes the bigger of two sizes. A checkpoint later tested that a size-1 axis broadcasts to size 0. Follow the lesson, fail the checkpoint. The reference solution passed both, which is how it survived.

**Documentation that was never run.** The guide to using real tinygrad was first written by reading tinygrad's source, and said so. When it was finally run, it turned out softmax is three kernels for a batch of rows but two for a single vector, because the divide joins the scalar sum's kernel. Four exercises repeated the wrong count.

**Code no test reached.** A max-reduce over ints rendered its accumulator as `int acc = -inf`. Every reduce in the tests was a float.

It's the same lesson my NixOS config taught me from the other side: a check that covers one path gives you one path's worth of confidence. Verify proves the solution passes. Mutation proves near-misses fail. Neither proves the exercise *teaches*, and for that I haven't found anything better than reading it cold.

## Blanks stop working

The other thing I got wrong was difficulty. Every exercise was fill-in-the-blank, with a median of three holes and 67 characters of answer. That's the right way to start on something new and the wrong way to finish, because at some point you're pattern-matching the surrounding code instead of thinking.

The fix was tooling rather than rewriting 200 files. `zig build -Dhard` runs a generated copy of the course in which every function that had a hole has lost its whole body. Same tests, same hints. And after each part there's a checkpoint: five functions from five different chapters, written from memory, with the exercise number as the only cue.

## The part with a GPU in it

Parts I to IV teach with small invented IRs. Part V rebuilds tinygrad as it is today, with its real UOps, the UIR text format, rangeify and the code generator, to the spec of George Hotz's [10-411](https://10-411.com/) course. Part VI runs the kernels on real hardware.

My favourite detail there: there's no CUDA toolkit involved. Zig's bundled clang compiles C to PTX with `zig cc -target nvptx64-cuda-none`, and the exercises load `libcuda` and talk to the driver API directly, the way tinygrad's own backend does. Without a GPU the tests compile the kernels and skip.

Numbers from my machine, an i5-12400F and an RTX 5060 Ti:

| Kernel | Before | After |
|---|---|---|
| CPU matmul, BEAM search over compiled kernels | 3 GFLOPS | 80 GFLOPS |
| GPU matmul, naive to register-blocked | 1.4 TFLOPS | 4.8 TFLOPS (5.0 on tensor cores) |
| 3x3 convolution, direct to blocked | 1.55 TFLOPS | 2.67 TFLOPS |
| Attention, naive to flash | 8.1 ms | 3.7 ms |

The card measures about 21.6 TFLOPS in FP32, so there's a long way left to go, and the exercises say so.

## Try it

```sh
git clone https://github.com/Ziad0dev/zigrad
cd zigrad
zig build
```

You need Zig 0.16.0, or `nix develop`. It stops at the first exercise that doesn't pass and gives you a hint. You don't need maths past school algebra or any Zig.

And if you find an exercise where a wrong answer passes, that's a bug. I'd like to hear about it.
