-- Live bets: a true/false mark on each bet for "placed after the game started".
-- The bet ticket sets it at save; Edit / grade and Bet Admin can change it.
-- Safe to run more than once. Until it is run, bets still save (without the mark).

alter table bets add column if not exists live boolean not null default false;

-- Existing bets whose text already says "Live" ("Carolina Panthers +3 Live")
update bets set live = true where live = false and bet ~* '\mlive\M';

-- How many were marked
select count(*) as live_bets from bets where live;
