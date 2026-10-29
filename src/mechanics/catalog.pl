:- use_module(library(clpfd)).

% Stage A: compatible unshifted module-2 spur gears, 20 degree pressure angle.
gear_pair(Target, A, B, Actual, Distance, Error) :-
    A in 20\/30\/40\/50,
    B in 20\/30\/40\/50,
    labeling([], [A,B]),
    Actual is B/A,
    Distance is A+B,
    Error is abs(Actual-Target)/Target.

best_pair(Target, A, B, Actual, Distance, Error) :-
    Target > 0,
    setof(E-(X+Y)-X-Y-R-D, gear_pair(Target,X,Y,R,D,E),
          [Error-_-A-B-Actual-Distance|_]).
