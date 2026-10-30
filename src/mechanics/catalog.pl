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

mesh(A,B,R,D) :- gear(A,ZA,M,P), gear(B,ZB,M,P), R is ZB/ZA, D is M*(ZA+ZB)/2.
topology(direct,1,opposite,[A,B],R,[D]) :- mesh(A,B,R,D).
topology(idler,1,same,[A,B,C],R,[D,E]) :- mesh(A,B,R1,D),mesh(B,C,R2,E),R is R1*R2.
topology(two_idlers,1,opposite,[A,B,C,F],R,[D,E,G]) :- mesh(A,B,R1,D),mesh(B,C,R2,E),mesh(C,F,R3,G),R is R1*R2*R3.
topology(compound,2,same,[A,B,C,F],R,[D,E]) :- mesh(A,B,R1,D),mesh(C,F,R2,E),R is R1*R2.

% Discrete catalog choices and coarse reachability; exact placement is in search.ts.
candidate(Target,Layers,Direction,Tolerance,Span,Kind,Ids) :-
    topology(Kind,L,Dir,Ids,R,Lengths), L =< Layers,
    (Direction == any ; Direction == Dir),
    abs(R-Target)/Target =< Tolerance+0.000000001,
    sum_list(Lengths,Max), max_list(Lengths,Longest), Min is max(0,2*Longest-Max),
    Span =< Max+0.000001, Span >= Min-0.000001.
% Bounded two-stage mixed chains. Exact fixed-axis placement and construction follow in TS.
mixed_teeth(spur,Z) :- member(Z,[20,30,40,50]).
mixed_teeth(belt,Z) :- member(Z,[16,20,30,40,60]).
mixed_length(spur,0).
mixed_length(belt,L) :- member(L,[200,280,300,400,500,600,610,752,800]).
mixed_candidate(Target,Tolerance,Allowed,K,W,S,A,B,L) :-
    member(K,[spur,belt]), (Allowed==both ; Allowed==K),
    member(W,[30,40]), member(S,[1,2]), mixed_teeth(K,A),mixed_teeth(K,B),
    R is W/S*B/A, abs(R-Target)/Target =< Tolerance+0.000000001,
    mixed_length(K,L).
