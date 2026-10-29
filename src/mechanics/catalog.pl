:- use_module(library(clpfd)).

% Facts are generated from the versioned TypeScript catalog by the worker.
:- dynamic gear/4.
gear_pair(Target, IdA, IdB, A, B, Actual, Distance, Error) :-
    gear(IdA, A, Module, Angle),
    gear(IdB, B, Module, Angle),
    Actual is B/A,
    Distance is Module*(A+B)/2,
    Error is abs(Actual-Target)/Target.

best_pair(Target, IdA, IdB, A, B, Actual, Distance, Error) :-
    Target > 0,
    setof(E-D-X-Y-I-J-R, gear_pair(Target,I,J,X,Y,R,D,E),
          [Error-Distance-A-B-IdA-IdB-Actual|_]).
