/*
  Warnings:

  - A unique constraint covering the columns `[loan_id]` on the table `guarantors` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "guarantors_loan_id_key" ON "guarantors"("loan_id");
